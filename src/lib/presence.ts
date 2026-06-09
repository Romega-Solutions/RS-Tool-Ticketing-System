import type { AppRole } from './rbac';
import { normalizePingMessage } from './presence-ping';

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
};

// ── In-memory store ────────────────────────────────────────────────────────────
// Resets on server restart — acceptable for a small internal tool.

const online:    Map<number, PresenceUser>                          = new Map();
const subs:      Map<number, Subscriber>                            = new Map();
// Live subscribers see ALL clock events regardless of role/team.
const liveSubs:  Map<number, Set<ReadableStreamDefaultController>>  = new Map();
const enc = new TextEncoder();

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
  | { ok: true; event: PresencePingEvent }
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

  const event: PresencePingEvent = {
    type: 'user_ping',
    id: `${createdAt}-${from.userId}-${toUserId}`,
    from,
    toUserId,
    message: normalizePingMessage(message),
    createdAt,
  };
  for (const target of targets) {
    sendEvent(target, event);
  }
  return { ok: true, event };
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
}
