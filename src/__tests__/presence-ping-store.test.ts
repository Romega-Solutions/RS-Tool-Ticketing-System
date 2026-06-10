import { describe, expect, it } from 'vitest';
import type { PresencePingRecord } from '@/lib/presence';
import {
  buildPresencePingSnapshotFromRecords,
  presencePingRecordFromRow,
  presencePingRecordToRow,
} from '@/lib/presence-ping-store';

const record: PresencePingRecord = {
  type: 'user_ping',
  id: 'ping-1',
  from: {
    userId: 1,
    name: 'Sender',
    role: 'lead',
    team: 'Engineering',
    photoUrl: null,
  },
  senderId: 1,
  targetUserId: 2,
  toUserId: 2,
  message: 'Are you online?',
  replyMessage: null,
  status: 'pending',
  createdAt: '2026-06-10T02:00:00.000Z',
  deadlineAt: '2026-06-10T03:00:00.000Z',
  acknowledgedAt: null,
  missedAt: null,
};

describe('presence ping store mapping', () => {
  it('maps a live ping record into a database row', () => {
    expect(presencePingRecordToRow(record)).toMatchObject({
      id: 'ping-1',
      from_user_id: 1,
      from_name: 'Sender',
      from_role: 'lead',
      from_team: 'Engineering',
      to_user_id: 2,
      message: 'Are you online?',
      response_message: null,
      status: 'pending',
      created_at: '2026-06-10T02:00:00.000Z',
      deadline_at: '2026-06-10T03:00:00.000Z',
      acknowledged_at: null,
      missed_at: null,
    });
  });

  it('maps a stored row back into a live ping record', () => {
    expect(presencePingRecordFromRow({
      id: 'ping-1',
      from_user_id: 1,
      from_name: 'Sender',
      from_role: 'lead',
      from_team: 'Engineering',
      from_photo_url: null,
      to_user_id: 2,
      message: 'Are you online?',
      response_message: "I'm here",
      status: 'acknowledged',
      created_at: '2026-06-10T02:00:00.000Z',
      deadline_at: '2026-06-10T03:00:00.000Z',
      acknowledged_at: '2026-06-10T02:10:00.000Z',
      missed_at: null,
      updated_at: '2026-06-10T02:10:00.000Z',
    })).toMatchObject({
      id: 'ping-1',
      senderId: 1,
      targetUserId: 2,
      replyMessage: "I'm here",
      status: 'acknowledged',
      acknowledgedAt: '2026-06-10T02:10:00.000Z',
    });
  });

  it('builds record keeping summaries from stored records', () => {
    const snapshot = buildPresencePingSnapshotFromRecords([{
      ...record,
      status: 'missed',
      missedAt: '2026-06-10T03:01:00.000Z',
    }], 1, new Date('2026-06-10T03:02:00.000Z'));

    expect(snapshot.byUserId[2]).toMatchObject({
      missedReplyCount: 1,
      latestMissedAt: '2026-06-10T03:01:00.000Z',
    });
  });
});
