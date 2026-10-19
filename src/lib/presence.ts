import { randomUUID } from 'node:crypto';
import type { AppRole } from './rbac';
import { normalizePingMessage, normalizePingReply } from './presence-ping';

// ── Types ──────────────────────────────────────────────────────────────────────

export type PresenceUser = {
  userId:      number;
  name:        string;
  role:        AppRole;
  team:        string | null;
  clockedInAt: string; // ISO string
  weekSecondsBefore?: number; // completed seconds earlier this Mon–Sun week — fixed for the open session, used for the weekly OT badge
  photoUrl?:   string | null; // org chart photo, resolved at clock-in / hydration
};

export type PresencePingActor = {
  userId:   number;
  name:     string;
  role:     AppRole;
  team:     string | null;
  photoUrl?: string | null;
};

export type PresencePingEvent = {
  type:      'user_ping';
  id:        string;
  from:      PresencePingActor;
  toUserId:  number;
  message:   string;
  createdAt: string;
  deadlineAt: string;
};

export type PresencePingStatus = 'pending' | 'acknowledged' | 'missed';

export type PresencePingRecord = PresencePingEvent & {
  senderId: number;
  targetUserId: number;
  status: PresencePingStatus;
  replyMessage: string | null;
  acknowledgedAt: string | null;
  missedAt: string | null;
};

export type PresencePingReplyEvent = {
  type: 'user_ping_reply';
  id: string;
  pingId: string;
  fromUserId: number;
  toUserId: number;
  responderName: string;
  replyMessage: string;
  acknowledgedAt: string;
};

export type PresencePingUserSummary = {
  userId: number;
  awaitingReplyCount: number;
  acknowledgedReplyCount: number;
  missedReplyCount: number;
  requiresMyReplyCount: number;
  missedMeCount: number;
  nextDeadlineAt: string | null;
  latestMissedAt: string | null;
};

export type PresencePingSnapshot = {
  byUserId: Record<number, PresencePingUserSummary>;
  sent: PresencePingRecord[];
  received: PresencePingRecord[];
};

// Nothing is kept in memory here: serverless instances don't share state. Who
// is online comes from open `timesheets` rows (presence-online.ts) and pings
// live in the `presence_pings` table (presence-ping-store.ts).

export const PRESENCE_PING_RESPONSE_WINDOW_MS = 60 * 60 * 1000;

type PingResult =
  | { ok: true; event: PresencePingEvent; record: PresencePingRecord }
  | { ok: false; reason: 'self' };

// ── Public API ─────────────────────────────────────────────────────────────────

function pingDeadline(createdAt: string): string {
  return new Date(Date.parse(createdAt) + PRESENCE_PING_RESPONSE_WINDOW_MS).toISOString();
}

function nextPingId(createdAt: string, fromUserId: number, toUserId: number): string {
  return `${createdAt}-${fromUserId}-${toUserId}-${randomUUID().slice(0, 8)}`;
}

function emptyPingSummary(userId: number): PresencePingUserSummary {
  return {
    userId,
    awaitingReplyCount: 0,
    acknowledgedReplyCount: 0,
    missedReplyCount: 0,
    requiresMyReplyCount: 0,
    missedMeCount: 0,
    nextDeadlineAt: null,
    latestMissedAt: null,
  };
}

function nextDeadline(current: string | null, candidate: string): string {
  if (!current) return candidate;
  return Date.parse(candidate) < Date.parse(current) ? candidate : current;
}

function latestDate(current: string | null, candidate: string | null): string | null {
  if (!candidate) return current;
  if (!current) return candidate;
  return Date.parse(candidate) > Date.parse(current) ? candidate : current;
}

export function sendPresencePing({
  from,
  toUserId,
  message,
  createdAt = new Date().toISOString(),
}: {
  from: PresencePingActor;
  toUserId: number;
  message?: string | null;
  createdAt?: string;
}): PingResult {
  // Whether the target is clocked in is checked by the caller against the DB.
  if (from.userId === toUserId) return { ok: false, reason: 'self' };

  const id = nextPingId(createdAt, from.userId, toUserId);
  const deadlineAt = pingDeadline(createdAt);
  const event: PresencePingEvent = {
    type: 'user_ping',
    id,
    from,
    toUserId,
    message: normalizePingMessage(message),
    createdAt,
    deadlineAt,
  };
  const record: PresencePingRecord = {
    ...event,
    senderId: from.userId,
    targetUserId: toUserId,
    status: 'pending',
    replyMessage: null,
    acknowledgedAt: null,
    missedAt: null,
  };

  return { ok: true, event, record };
}

export function sendPresencePingReply({
  record,
  responderName,
}: {
  record: PresencePingRecord;
  responderName: string;
}): PresencePingReplyEvent {
  const event: PresencePingReplyEvent = {
    type: 'user_ping_reply',
    id: `${record.id}-reply`,
    pingId: record.id,
    fromUserId: record.targetUserId,
    toUserId: record.senderId,
    responderName,
    replyMessage: normalizePingReply(record.replyMessage),
    acknowledgedAt: record.acknowledgedAt ?? new Date().toISOString(),
  };
  return event;
}

export function createPresencePingSnapshotFromRecords(
  records: PresencePingRecord[],
  userId: number,
  now = new Date(),
): PresencePingSnapshot {
  const nowMs = now.getTime();
  const sent: PresencePingRecord[] = [];
  const received: PresencePingRecord[] = [];
  const byUserId: Record<number, PresencePingUserSummary> = {};

  function summaryFor(id: number): PresencePingUserSummary {
    byUserId[id] ??= emptyPingSummary(id);
    return byUserId[id];
  }

  for (const record of records) {
    if (record.status === 'pending' && Date.parse(record.deadlineAt) <= nowMs) {
      record.status = 'missed';
      record.missedAt = now.toISOString();
    }

    if (record.senderId === userId) {
      sent.push(record);
      const summary = summaryFor(record.targetUserId);
      if (record.status === 'pending') {
        summary.awaitingReplyCount += 1;
        summary.nextDeadlineAt = nextDeadline(summary.nextDeadlineAt, record.deadlineAt);
      } else if (record.status === 'acknowledged') {
        summary.acknowledgedReplyCount += 1;
      } else if (record.status === 'missed') {
        summary.missedReplyCount += 1;
        summary.latestMissedAt = latestDate(summary.latestMissedAt, record.missedAt);
      }
    }

    if (record.targetUserId === userId) {
      received.push(record);
      const summary = summaryFor(record.targetUserId);
      if (record.status === 'pending') {
        summary.requiresMyReplyCount += 1;
        summary.nextDeadlineAt = nextDeadline(summary.nextDeadlineAt, record.deadlineAt);
      } else if (record.status === 'missed') {
        summary.missedMeCount += 1;
        summary.latestMissedAt = latestDate(summary.latestMissedAt, record.missedAt);
      }
    }
  }

  const newestFirst = (a: PresencePingRecord, b: PresencePingRecord) =>
    Date.parse(b.createdAt) - Date.parse(a.createdAt);

  return {
    byUserId,
    sent: sent.sort(newestFirst),
    received: received.sort(newestFirst),
  };
}
