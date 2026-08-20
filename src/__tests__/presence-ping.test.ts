import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetPresenceForTests,
  acknowledgePresencePing,
  clockIn,
  getPresencePingSnapshotForUser,
  PRESENCE_PING_RESPONSE_WINDOW_MS,
  sendPresencePingReply,
  sendPresencePing,
  type PresenceUser,
} from '@/lib/presence';
import { normalizePingMessage } from '@/lib/presence-ping';

function makeUser(overrides: Partial<PresenceUser> & { userId: number }): PresenceUser {
  return {
    name: 'Test User',
    role: 'ic',
    team: 'Engineering',
    clockedInAt: '2026-06-10T01:00:00.000Z',
    ...overrides,
  };
}

describe('normalizePingMessage', () => {
  it('uses the default quick ping when the message is blank', () => {
    expect(normalizePingMessage('   ')).toBe('Are you online?');
  });

  it('limits ping messages to 160 characters', () => {
    expect(normalizePingMessage('x'.repeat(200))).toHaveLength(160);
  });
});

describe('sendPresencePing', () => {
  beforeEach(() => {
    __resetPresenceForTests();
  });

  it('delivers a ping to a user who is clocked in, regardless of live connection state', () => {
    const target = makeUser({ userId: 2, name: 'Receiver' });
    clockIn(target);

    const result = sendPresencePing({
      from: { userId: 1, name: 'Sender', role: 'lead', team: 'Engineering', photoUrl: null },
      toUserId: 2,
      message: 'Can you check this?',
      createdAt: '2026-06-10T02:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.type).toBe('user_ping');
    expect(result.event.message).toBe('Can you check this?');
    expect(result.event.from.name).toBe('Sender');
  });

  it('tracks a delivered ping as a one-hour response task for sender and receiver', () => {
    clockIn(makeUser({ userId: 2, name: 'Receiver' }));

    const result = sendPresencePing({
      from: { userId: 1, name: 'Sender', role: 'lead', team: 'Engineering', photoUrl: null },
      toUserId: 2,
      message: 'Please confirm you are online.',
      createdAt: '2026-06-10T02:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.deadlineAt).toBe(
      new Date(Date.parse(result.record.createdAt) + PRESENCE_PING_RESPONSE_WINDOW_MS).toISOString(),
    );

    const senderSnapshot = getPresencePingSnapshotForUser(1, new Date('2026-06-10T02:10:00.000Z'));
    expect(senderSnapshot.byUserId[2]).toMatchObject({
      awaitingReplyCount: 1,
      missedReplyCount: 0,
    });

    const receiverSnapshot = getPresencePingSnapshotForUser(2, new Date('2026-06-10T02:10:00.000Z'));
    expect(receiverSnapshot.byUserId[2]).toMatchObject({
      requiresMyReplyCount: 1,
      missedMeCount: 0,
    });
  });

  it('acknowledges a ping before the one-hour response window expires', () => {
    clockIn(makeUser({ userId: 2, name: 'Receiver' }));

    const sent = sendPresencePing({
      from: { userId: 1, name: 'Sender', role: 'lead', team: 'Engineering', photoUrl: null },
      toUserId: 2,
      message: 'Please confirm you are online.',
      createdAt: '2026-06-10T02:00:00.000Z',
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;

    const ack = acknowledgePresencePing({
      eventId: sent.event.id,
      userId: 2,
      now: new Date('2026-06-10T02:30:00.000Z'),
    });

    expect(ack).toMatchObject({ ok: true });
    const senderSnapshot = getPresencePingSnapshotForUser(1, new Date('2026-06-10T02:31:00.000Z'));
    expect(senderSnapshot.byUserId[2]).toMatchObject({
      awaitingReplyCount: 0,
      acknowledgedReplyCount: 1,
      missedReplyCount: 0,
    });
  });

  it('builds a reply event once the receiver acknowledges a ping', () => {
    clockIn(makeUser({ userId: 2, name: 'Receiver' }));

    const sent = sendPresencePing({
      from: { userId: 1, name: 'Sender', role: 'lead', team: 'Engineering', photoUrl: null },
      toUserId: 2,
      message: 'Please confirm you are online.',
      createdAt: '2026-06-10T02:00:00.000Z',
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;

    const ack = acknowledgePresencePing({
      eventId: sent.event.id,
      userId: 2,
      replyMessage: "I'm here",
      now: new Date('2026-06-10T02:30:00.000Z'),
    });
    expect(ack.ok).toBe(true);
    if (!ack.ok) return;

    const reply = sendPresencePingReply({
      record: ack.record,
      responderName: 'Receiver',
    });

    expect(reply.type).toBe('user_ping_reply');
    expect(reply.toUserId).toBe(1);
    expect(reply.replyMessage).toBe("I'm here");
    expect(reply.responderName).toBe('Receiver');
  });

  it('marks an unanswered ping missed after the one-hour response window expires', () => {
    clockIn(makeUser({ userId: 2, name: 'Receiver' }));

    const sent = sendPresencePing({
      from: { userId: 1, name: 'Sender', role: 'lead', team: 'Engineering', photoUrl: null },
      toUserId: 2,
      message: 'Please confirm you are online.',
      createdAt: '2026-06-10T02:00:00.000Z',
    });
    expect(sent.ok).toBe(true);

    const senderSnapshot = getPresencePingSnapshotForUser(1, new Date('2026-06-10T03:01:00.000Z'));
    expect(senderSnapshot.byUserId[2]).toMatchObject({
      awaitingReplyCount: 0,
      missedReplyCount: 1,
    });

    const receiverSnapshot = getPresencePingSnapshotForUser(2, new Date('2026-06-10T03:01:00.000Z'));
    expect(receiverSnapshot.byUserId[2]).toMatchObject({
      requiresMyReplyCount: 0,
      missedMeCount: 1,
    });
  });

  it('rejects a ping when the target is not clocked in', () => {
    const result = sendPresencePing({
      from: { userId: 1, name: 'Sender', role: 'lead', team: 'Engineering', photoUrl: null },
      toUserId: 2,
      message: 'Can you check this?',
      createdAt: '2026-06-10T02:00:00.000Z',
    });

    expect(result).toEqual({
      ok: false,
      reason: 'not_online',
    });
  });
});
