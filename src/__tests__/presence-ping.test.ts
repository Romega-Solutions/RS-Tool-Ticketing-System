import { describe, expect, it } from 'vitest';
import {
  createPresencePingSnapshotFromRecords,
  PRESENCE_PING_RESPONSE_WINDOW_MS,
  sendPresencePingReply,
  sendPresencePing,
  type PresencePingRecord,
} from '@/lib/presence';
import { normalizePingMessage } from '@/lib/presence-ping';

const sender = { userId: 1, name: 'Sender', role: 'lead' as const, team: 'Engineering', photoUrl: null };

function sendTo2(message = 'Please confirm you are online.'): PresencePingRecord {
  const result = sendPresencePing({
    from: sender,
    toUserId: 2,
    message,
    createdAt: '2026-06-10T02:00:00.000Z',
  });
  if (!result.ok) throw new Error(`ping rejected: ${result.reason}`);
  return result.record;
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
  it('builds a user_ping event for the target', () => {
    const result = sendPresencePing({
      from: sender,
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

  it('rejects pinging yourself', () => {
    const result = sendPresencePing({ from: sender, toUserId: 1 });
    expect(result).toEqual({ ok: false, reason: 'self' });
  });

  it('gives each ping a unique id even when sent in the same millisecond', () => {
    expect(sendTo2().id).not.toBe(sendTo2().id);
  });

  it('starts a pending ping with a one-hour response deadline', () => {
    const record = sendTo2();
    expect(record.status).toBe('pending');
    expect(record.deadlineAt).toBe(
      new Date(Date.parse(record.createdAt) + PRESENCE_PING_RESPONSE_WINDOW_MS).toISOString(),
    );
  });
});

describe('createPresencePingSnapshotFromRecords', () => {
  it('tracks a pending ping as a response task for sender and receiver', () => {
    const record = sendTo2();
    const at = new Date('2026-06-10T02:10:00.000Z');

    expect(createPresencePingSnapshotFromRecords([{ ...record }], 1, at).byUserId[2]).toMatchObject({
      awaitingReplyCount: 1,
      missedReplyCount: 0,
    });
    expect(createPresencePingSnapshotFromRecords([{ ...record }], 2, at).byUserId[2]).toMatchObject({
      requiresMyReplyCount: 1,
      missedMeCount: 0,
    });
  });

  it('counts an acknowledged ping as replied', () => {
    const record: PresencePingRecord = {
      ...sendTo2(),
      status: 'acknowledged',
      acknowledgedAt: '2026-06-10T02:30:00.000Z',
    };

    expect(
      createPresencePingSnapshotFromRecords([record], 1, new Date('2026-06-10T02:31:00.000Z')).byUserId[2],
    ).toMatchObject({
      awaitingReplyCount: 0,
      acknowledgedReplyCount: 1,
      missedReplyCount: 0,
    });
  });

  it('marks an unanswered ping missed after the one-hour response window expires', () => {
    const record = sendTo2();
    const at = new Date('2026-06-10T03:01:00.000Z');

    expect(createPresencePingSnapshotFromRecords([{ ...record }], 1, at).byUserId[2]).toMatchObject({
      awaitingReplyCount: 0,
      missedReplyCount: 1,
    });
    expect(createPresencePingSnapshotFromRecords([{ ...record }], 2, at).byUserId[2]).toMatchObject({
      requiresMyReplyCount: 0,
      missedMeCount: 1,
    });
  });
});

describe('sendPresencePingReply', () => {
  it('builds a reply event for an acknowledged ping', () => {
    const record: PresencePingRecord = {
      ...sendTo2(),
      status: 'acknowledged',
      replyMessage: "I'm here",
      acknowledgedAt: '2026-06-10T02:30:00.000Z',
    };

    const reply = sendPresencePingReply({ record, responderName: 'Receiver' });

    expect(reply.type).toBe('user_ping_reply');
    expect(reply.toUserId).toBe(1);
    expect(reply.replyMessage).toBe("I'm here");
    expect(reply.responderName).toBe('Receiver');
  });
});
