import type { AppRole } from './rbac';

// ── Types ──────────────────────────────────────────────────────────────────────

export type PresenceUser = {
  userId:      number;
  name:        string;
  role:        AppRole;
  team:        string | null;
  clockedInAt: string; // ISO string
};

type Subscriber = {
  ctrl:   ReadableStreamDefaultController;
  userId: number;
  role:   AppRole;
  team:   string | null;
};

// ── In-memory store ────────────────────────────────────────────────────────────
// Resets on server restart — acceptable for a small internal tool.

const online: Map<number, PresenceUser>  = new Map();
const subs:   Map<number, Subscriber>    = new Map();
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

function broadcast(
  event: { type: 'clock_in'; user: PresenceUser } | { type: 'clock_out'; userId: number },
) {
  for (const [, sub] of subs) {
    const target: PresenceUser | undefined =
      event.type === 'clock_in'
        ? event.user
        : online.get(event.userId) ?? { userId: event.userId, name: '', role: 'ic', team: null, clockedInAt: '' };

    if (!canSee(sub.role, sub.team, sub.userId, target)) continue;
    sendEvent(sub.ctrl, event);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function clockIn(user: PresenceUser): void {
  online.set(user.userId, user);
  broadcast({ type: 'clock_in', user });
}

export function clockOut(userId: number): void {
  broadcast({ type: 'clock_out', userId });
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
