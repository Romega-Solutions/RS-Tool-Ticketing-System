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

type Subscriber = {
  ctrl:   ReadableStreamDefaultController;
  userId: number;
  role:   AppRole;
  team:   string | null;
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

// ── In-memory store ────────────────────────────────────────────────────────────
// Resets on server restart — acceptable for a small internal tool.

const online:    Map<number, PresenceUser>                          = new Map();
const subs:      Map<number, Subscriber>                            = new Map();
// Live subscribers see ALL clock events regardless of role/team.
const liveSubs:  Map<number, Set<ReadableStreamDefaultController>>  = new Map();
const presencePings: Map<string, PresencePingRecord>                 = new Map();
const enc = new TextEncoder();
let pingSequence = 0;

export const PRESENCE_PING_RESPONSE_WINDOW_MS = 60 * 60 * 1000;

// ── Visibility check ───────────────────────────────────────────────────────────
// Returns true if a viewer is allowed to see targetUser's presence.

function canSee(
  viewerRole: AppRole,
  viewerTeam: string | null,
  viewerUserId: number,
  target: PresenceUser,
): boolean {
  if (viewerRole === 'admin')   return true;
  if (target.userId === viewerUserId) return true;
  if (viewerRole === 'lead' && target.role === 'ic' && target.team === viewerTeam) return true;
  return false;
}

// ── SSE helpers ────────────────────────────────────────────────────────────────

function sendEvent(ctrl: ReadableStreamDefaultController, payload: unknown) {
  try {
    ctrl.enqueue(enc.encode(`data: ${JSON.stringify(payload)}\n\n`));
  } catch {
    // controller closed — will be cleaned up on next broadcast
  }
}

type PresenceEvent =
  | { type: 'clock_in';  user: PresenceUser }
  | { type: 'clock_out'; userId: number };

type PingResult =
  | { ok: true; event: PresencePingEvent; record: PresencePingRecord }
  | { ok: false; reason: 'self' | 'not_online' | 'not_connected' };

function broadcast(event: PresenceEvent) {
  for (const [, sub] of subs) {
    const target: PresenceUser | undefined =
      event.type === 'clock_in'
        ? event.user
        : online.get(event.userId) ?? { userId: event.userId, name: '', role: 'ic', team: null, clockedInAt: '' };

    if (!canSee(sub.role, sub.team, sub.userId, target)) continue;
    sendEvent(sub.ctrl, event);
  }
}

function broadcastToLive(event: PresenceEvent) {
  for (const [, ctrls] of liveSubs) {
    for (const ctrl of ctrls) {
      sendEvent(ctrl, event);
    }
  }
}

function sendToLiveUser(userId: number, event: unknown) {
  const ctrls = liveSubs.get(userId);
  if (!ctrls?.size) return;
  for (const ctrl of ctrls) {
    sendEvent(ctrl, event);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function clockIn(user: PresenceUser): void {
  online.set(user.userId, user);
  broadcast({ type: 'clock_in', user });
  broadcastToLive({ type: 'clock_in', user });
}

export function clockOut(userId: number): void {
  // Broadcast before deleting so filtered subs can still resolve the user
  broadcast({ type: 'clock_out', userId });
  broadcastToLive({ type: 'clock_out', userId });
  online.delete(userId);
}

/** Filtered snapshot of who is currently online, visible to this viewer. */
export function getOnline(
  viewerRole: AppRole,
  viewerTeam: string | null,
  viewerUserId: number,
): PresenceUser[] {
  return [...online.values()].filter(u => canSee(viewerRole, viewerTeam, viewerUserId, u));
}

/** Open user's own timesheet entry in the store (for widget restore on refresh). */
export function getMyEntry(userId: number): PresenceUser | undefined {
  return online.get(userId);
}

export function subscribe(sub: Subscriber): void {
  subs.set(sub.userId, sub);
}

export function unsubscribe(userId: number): void {
  subs.delete(userId);
}

/** All online users — no visibility filter. Used by the live page. */
export function getAllOnline(): PresenceUser[] {
  return [...online.values()];
}

export function subscribeToLive(userId: number, ctrl: ReadableStreamDefaultController): void {
  const ctrls = liveSubs.get(userId) ?? new Set<ReadableStreamDefaultController>();
  ctrls.add(ctrl);
  liveSubs.set(userId, ctrls);
}

export function unsubscribeFromLive(userId: number, ctrl?: ReadableStreamDefaultController): void {
  if (!ctrl) {
    liveSubs.delete(userId);
    return;
  }

  const ctrls = liveSubs.get(userId);
  if (!ctrls) return;
  ctrls.delete(ctrl);
  if (ctrls.size === 0) liveSubs.delete(userId);
}

function pingDeadline(createdAt: string): string {
  return new Date(Date.parse(createdAt) + PRESENCE_PING_RESPONSE_WINDOW_MS).toISOString();
}

function nextPingId(createdAt: string, fromUserId: number, toUserId: number): string {
  pingSequence += 1;
  return `${createdAt}-${fromUserId}-${toUserId}-${pingSequence}`;
}

function markExpiredPresencePings(now = new Date()): void {
  const nowMs = now.getTime();
  for (const record of presencePings.values()) {
    if (record.status !== 'pending') continue;
    if (Date.parse(record.deadlineAt) > nowMs) continue;
    record.status = 'missed';
    record.missedAt = now.toISOString();
  }
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
  if (from.userId === toUserId) return { ok: false, reason: 'self' };
  if (!online.has(toUserId)) return { ok: false, reason: 'not_online' };

  const targets = liveSubs.get(toUserId);
  if (!targets?.size) return { ok: false, reason: 'not_connected' };

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
  presencePings.set(id, record);

  for (const target of targets) sendEvent(target, event);
  return { ok: true, event, record };
}

export function acknowledgePresencePing({
  eventId,
  userId,
  replyMessage,
  now = new Date(),
}: {
  eventId: string;
  userId: number;
  replyMessage?: string | null;
  now?: Date;
}): { ok: true; record: PresencePingRecord } | { ok: false; reason: 'not_found' | 'forbidden' | 'expired'; record?: PresencePingRecord } {
  const record = presencePings.get(eventId);
  if (!record) return { ok: false, reason: 'not_found' };
  if (record.targetUserId !== userId) return { ok: false, reason: 'forbidden' };

  markExpiredPresencePings(now);
  if (record.status === 'missed') return { ok: false, reason: 'expired', record };
  if (record.status === 'acknowledged') return { ok: true, record };

  record.status = 'acknowledged';
  record.replyMessage = normalizePingReply(replyMessage);
  record.acknowledgedAt = now.toISOString();
  return { ok: true, record };
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
  sendToLiveUser(record.senderId, event);
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

export function getPresencePingSnapshotForUser(userId: number, now = new Date()): PresencePingSnapshot {
  markExpiredPresencePings(now);
  return createPresencePingSnapshotFromRecords([...presencePings.values()], userId, now);
}

/** Seed users from DB without broadcasting. Used for post-restart hydration. */
export function seedUsers(users: PresenceUser[]): void {
  for (const u of users) {
    if (!online.has(u.userId)) {
      online.set(u.userId, u);
    }
  }
}

export function __resetPresenceForTests(): void {
  online.clear();
  subs.clear();
  liveSubs.clear();
  presencePings.clear();
  pingSequence = 0;
}
