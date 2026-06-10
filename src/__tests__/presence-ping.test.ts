import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetPresenceForTests,
  acknowledgePresencePing,
  clockIn,
  getPresencePingSnapshotForUser,
  PRESENCE_PING_RESPONSE_WINDOW_MS,
  sendPresencePingReply,
  sendPresencePing,
  subscribeToLive,
  type PresenceUser,
} from '@/lib/presence';
import { normalizePingMessage } from '@/lib/presence-ping';

const encoder = new TextDecoder();

function makeUser(overrides: Partial<PresenceUser> & { userId: number }): PresenceUser {
  return {
    name: 'Test User',
    role: 'ic',
    team: 'Engineering',
    clockedInAt: '2026-06-10T01:00:00.000Z',
    ...overrides,
  };
}

function makeController() {
  const chunks: string[] = [];
  const ctrl = {
    enqueue(chunk: Uint8Array) {
      chunks.push(encoder.decode(chunk));
    },
  } as unknown as ReadableStreamDefaultController;
  return { ctrl, chunks };
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

  it('delivers a ping event only to the target live subscriber', () => {
    const target = makeUser({ userId: 2, name: 'Receiver' });
    clockIn(target);

    const targetStream = makeController();
    const otherStream = makeController();
    subscribeToLive(2, targetStream.ctrl);
    subscribeToLive(3, otherStream.ctrl);

    const result = sendPresencePing({
      from: { userId: 1, name: 'Sender', role: 'lead', team: 'Engineering', photoUrl: null },
      toUserId: 2,
      message: 'Can you check this?',
      createdAt: '2026-06-10T02:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(targetStream.chunks).toHaveLength(1);
    expect(otherStream.chunks).toHaveLength(0);
    expect(targetStream.chunks[0]).toContain('"type":"user_ping"');
    expect(targetStream.chunks[0]).toContain('"message":"Can you check this?"');
    expect(targetStream.chunks[0]).toContain('"name":"Sender"');
  });

  it('delivers a ping event to every live tab for the target user', () => {
    clockIn(makeUser({ userId: 2, name: 'Receiver' }));

    const firstTab = makeController();
    const secondTab = makeController();
    subscribeToLive(2, firstTab.ctrl);
    subscribeToLive(2, secondTab.ctrl);

    const result = sendPresencePing({
      from: { userId: 1, name: 'Sender', role: 'lead', team: 'Engineering', photoUrl: null },
      toUserId: 2,
      message: 'Can you check this?',
      createdAt: '2026-06-10T02:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(firstTab.chunks).toHaveLength(1);
    expect(secondTab.chunks).toHaveLength(1);
  });

  it('tracks a delivered ping as a one-hour response task for sender and receiver', () => {
    clockIn(makeUser({ userId: 2, name: 'Receiver' }));
    subscribeToLive(2, makeController().ctrl);

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
    subscribeToLive(2, makeController().ctrl);

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

  it('notifies the sender when the receiver replies to a ping', () => {
    clockIn(makeUser({ userId: 2, name: 'Receiver' }));
    subscribeToLive(2, makeController().ctrl);
    const senderStream = makeController();
    subscribeToLive(1, senderStream.ctrl);

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

    sendPresencePingReply({
      record: ack.record,
      responderName: 'Receiver',
    });

    expect(senderStream.chunks).toHaveLength(1);
    expect(senderStream.chunks[0]).toContain('"type":"user_ping_reply"');
    expect(senderStream.chunks[0]).toContain('"replyMessage":"I\'m here"');
    expect(senderStream.chunks[0]).toContain('"responderName":"Receiver"');
  });

  it('marks an unanswered ping missed after the one-hour response window expires', () => {
    clockIn(makeUser({ userId: 2, name: 'Receiver' }));
    subscribeToLive(2, makeController().ctrl);

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

  it('rejects a ping when the target is not live connected', () => {
    clockIn(makeUser({ userId: 2, name: 'Receiver' }));

    const result = sendPresencePing({
      from: { userId: 1, name: 'Sender', role: 'lead', team: 'Engineering', photoUrl: null },
      toUserId: 2,
      message: 'Can you check this?',
      createdAt: '2026-06-10T02:00:00.000Z',
    });

    expect(result).toEqual({
      ok: false,
      reason: 'not_connected',
    });
  });
});
