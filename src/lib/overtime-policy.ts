import { WEEKLY_CAP_SECONDS, SAFETY_CEILING_SECONDS, computeOvertime } from './utils';

// ─────────────────────────────────────────────────────────────────────────
// Pure overtime policy. All thresholds and decisions live here with no I/O,
// so the cron, the clock-in route, and the UI share one tested source of
// truth. Overtime is gated behind an admin approval and bounded by a 15h
// Mon–Sun weekly cap — there is no per-session or per-day cap, and no role is
// exempt (admins are capped exactly like everyone else). Only an active admin
// approval suspends the cap, and an absolute 16h safety ceiling applies to all.
// ─────────────────────────────────────────────────────────────────────────

function approvalActive(approvedUntil: string | null, now: Date): boolean {
  if (!approvedUntil) return false;
  const ms = new Date(approvedUntil).getTime();
  return Number.isFinite(ms) && now.getTime() < ms;
}

export type AutoClockOutInput = {
  role:              string | null | undefined;
  clockedInAt:       string;
  /** Completed (clocked-out) seconds for this user this Mon–Sun week, excluding the open session. */
  weekSecondsBefore: number;
  /** Latest active admin OT approval (ISO), or null. */
  approvedUntil:     string | null;
  now:               Date;
};

export type AutoClockOutDecision =
  | { action: 'skip';  reason: string }
  | { action: 'close'; elapsedSec: number; reason: string };

// Should this open session be auto-closed right now? Checks run in priority
// order; the first match wins.
export function decideAutoClockOut(input: AutoClockOutInput): AutoClockOutDecision {
  const clockedInMs = new Date(input.clockedInAt).getTime();
  if (!Number.isFinite(clockedInMs)) {
    return { action: 'skip', reason: 'invalid clocked_in_at' };
  }
  const elapsedSec = Math.max(0, Math.round((input.now.getTime() - clockedInMs) / 1000));

  // 1. Absolute safety ceiling — every role, no exceptions (ghost-session guard).
  if (elapsedSec >= SAFETY_CEILING_SECONDS) {
    return { action: 'close', elapsedSec, reason: 'safety ceiling' };
  }
  // 2. An active admin approval suspends the weekly cap (the only exemption — no
  //    role, including admin, is exempt without one).
  if (approvalActive(input.approvedUntil, input.now)) {
    return { action: 'skip', reason: 'approved overtime' };
  }
  // 3. 15h weekly cap (already-completed seconds + this running session).
  if (input.weekSecondsBefore + elapsedSec >= WEEKLY_CAP_SECONDS) {
    return { action: 'close', elapsedSec, reason: 'weekly cap' };
  }
  return { action: 'skip', reason: 'within limits' };
}

export type EnforcementPlan =
  | { close: false; reason: string }
  | { close: true; durationSeconds: number; isOvertime: boolean; overtimeSeconds: number | null; reason: string };

// Pure: given an open session's context, decide whether the weekly-cap policy
// requires closing it *now* and, if so, the exact timesheet fields to write.
// Composes decideAutoClockOut (should we close?) with computeOvertime (how much
// of the elapsed slice is overtime). Shared by the daily cron AND the
// close-on-read path so both produce byte-identical results — there is one
// enforcement decision in the codebase, not two that can drift.
export function planEnforcement(input: AutoClockOutInput): EnforcementPlan {
  const decision = decideAutoClockOut(input);
  if (decision.action === 'skip') return { close: false, reason: decision.reason };

  const { isOvertime, overtimeSeconds } = computeOvertime(input.weekSecondsBefore, decision.elapsedSec);
  return {
    close: true,
    durationSeconds: decision.elapsedSec,
    isOvertime,
    overtimeSeconds: isOvertime ? overtimeSeconds : null,
    reason: decision.reason,
  };
}

export type ClockInInput = {
  role:              string | null | undefined;
  /** Completed seconds for this user this Mon–Sun week. */
  weekSecondsBefore: number;
  approvedUntil:     string | null;
  now:               Date;
};

export type ClockInDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

// May this user start a new clock-in session right now? No role is exempt; the
// only thing that lifts the 15h cap is an active admin approval.
export function decideClockInAllowed(input: ClockInInput): ClockInDecision {
  if (approvalActive(input.approvedUntil, input.now)) return { allowed: true };
  if (input.weekSecondsBefore >= WEEKLY_CAP_SECONDS) {
    return { allowed: false, reason: 'weekly cap reached' };
  }
  return { allowed: true };
}

/** Current-week overtime-request status as the browser knows it. */
export type WeeklyCapRequestStatus = 'none' | 'pending' | 'approved';

export type ClockInCapLockInput = {
  /** Completed seconds for this user this Mon–Sun week. */
  weekSecondsBefore: number;
  /** This week's overtime-request status. */
  requestStatus:     WeeklyCapRequestStatus;
};

// Browser-side mirror of `decideClockInAllowed` for a *clocked-out* user: should
// the Clock In button be locked (disabled) because they're at/over the 15h cap
// with no active approval? No role is exempt (admins are capped too); an
// approved overtime request unlocks clock-in, while a merely *pending* request
// keeps it locked until the admin approves. Pure so the widget and tests share
// one rule.
export function isClockInCapLocked(input: ClockInCapLockInput): boolean {
  if (input.requestStatus === 'approved') return false;
  return input.weekSecondsBefore >= WEEKLY_CAP_SECONDS;
}

/** Monday (local) of the week containing `date`, as YYYY-MM-DD. */
export function weekStartMonday(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** The 7 Mon–Sun local date strings for the week containing `date`. */
export function weekDates(date: Date): string[] {
  const monday = new Date(weekStartMonday(date) + 'T00:00:00');
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getTime() + i * 86400000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${dd}`);
  }
  return out;
}
