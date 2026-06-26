import { SAFETY_CEILING_SECONDS, computeOvertime } from './utils';

// ─────────────────────────────────────────────────────────────────────────
// Pure overtime policy. All thresholds and decisions live here with no I/O,
// so the cron, the clock-in route, and the UI share one tested source of
// truth.
//
// Overtime is BUDGET-based: each user's weekly ALLOWANCE = the 15h Mon–Sun base
// cap PLUS any admin-approved overtime granted this week. Approving "+2h" raises
// the allowance to 17h — it does not merely open a wall-clock window. Enforcement
// is a hard ceiling at the allowance; once a user reaches it, the running session
// is cut and new clock-ins are blocked until the next week (or another grant). No
// role is exempt (admins included). An absolute 16h single-session safety ceiling
// still applies to everyone as a ghost-session guard.
// ─────────────────────────────────────────────────────────────────────────

export type AutoClockOutInput = {
  clockedInAt:       string;
  /** Completed (clocked-out) seconds for this user this Mon–Sun week, excluding the open session. */
  weekSecondsBefore: number;
  /** This week's hard ceiling: base allotment + admin-approved overtime granted this week. */
  allowanceSeconds:  number;
  /** This user's weekly base (approved hours × 3600). The OT slice is measured against this; defaults to the 15h base. */
  baseSeconds?:      number;
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

  // 1. Absolute single-session safety ceiling — every role, no exceptions
  //    (ghost-session guard for a tab left open / a forgotten clock-out).
  if (elapsedSec >= SAFETY_CEILING_SECONDS) {
    return { action: 'close', elapsedSec, reason: 'safety ceiling' };
  }
  // 2. Weekly allowance (15h base + approved grants). Hard ceiling for everyone.
  if (input.weekSecondsBefore + elapsedSec >= input.allowanceSeconds) {
    return { action: 'close', elapsedSec, reason: 'weekly allowance' };
  }
  return { action: 'skip', reason: 'within limits' };
}

export type EnforcementPlan =
  | { close: false; reason: string }
  | { close: true; durationSeconds: number; isOvertime: boolean; overtimeSeconds: number | null; reason: string };

// Pure: given an open session's context, decide whether the allowance policy
// requires closing it *now* and, if so, the exact timesheet fields to write.
// Composes decideAutoClockOut (should we close?) with computeOvertime (how much
// of the elapsed slice is overtime — still measured against the 15h base, so
// payroll's overtime accounting is unchanged even when the allowance is raised).
// Shared by the daily cron AND the close-on-read path so both produce
// byte-identical results — one enforcement decision, not two that can drift.
export function planEnforcement(input: AutoClockOutInput): EnforcementPlan {
  const decision = decideAutoClockOut(input);
  if (decision.action === 'skip') return { close: false, reason: decision.reason };

  const { isOvertime, overtimeSeconds } = computeOvertime(input.weekSecondsBefore, decision.elapsedSec, input.baseSeconds);
  return {
    close: true,
    durationSeconds: decision.elapsedSec,
    isOvertime,
    overtimeSeconds: isOvertime ? overtimeSeconds : null,
    reason: decision.reason,
  };
}

export type ClockInInput = {
  /** Completed seconds for this user this Mon–Sun week. */
  weekSecondsBefore: number;
  /** This week's hard ceiling: 15h base + approved grants. */
  allowanceSeconds:  number;
};

export type ClockInDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

// May this user start a new clock-in session right now? Blocked once their
// completed week-to-date has reached their allowance; an admin grant raises the
// allowance and so re-opens clock-in. No role is exempt.
export function decideClockInAllowed(input: ClockInInput): ClockInDecision {
  if (input.weekSecondsBefore >= input.allowanceSeconds) {
    return { allowed: false, reason: 'weekly allowance reached' };
  }
  return { allowed: true };
}

/** Current-week overtime-request status as the browser knows it (for CTA labels). */
export type WeeklyCapRequestStatus = 'none' | 'pending' | 'approved';

export type ClockInCapLockInput = {
  /** Completed seconds for this user this Mon–Sun week. */
  weekSecondsBefore: number;
  /** This week's hard ceiling: 15h base + approved grants. */
  allowanceSeconds:  number;
};

// Browser-side mirror of `decideClockInAllowed` for a *clocked-out* user: should
// the Clock In button be locked because they've reached their weekly allowance?
// Because an approved grant raises `allowanceSeconds`, the lock lifts on its own
// once the allowance exceeds their used time — no separate approval flag needed.
// Pure so the widget and tests share one rule.
export function isClockInCapLocked(input: ClockInCapLockInput): boolean {
  return input.weekSecondsBefore >= input.allowanceSeconds;
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
