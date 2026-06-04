import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

// ── Overtime ────────────────────────────────────────────────────────────────
// Overtime is weekly: any time worked beyond the 15h Mon–Sun cap. There is no
// per-session or per-day cap. This single rule is shared by every clock/presence
// surface and the DB write.

// Max regular (non-overtime) hours per Mon–Sun week. Once a contractor reaches
// this, new clock-ins are blocked and a running session is cut when it would
// cross it — unless an admin has approved overtime. Anything beyond it is OT.
export const WEEKLY_CAP_SECONDS = 15 * 60 * 60; // 54000

// Absolute ghost-session guard. Applies to EVERY role incl. admin, so an
// admin who closes their tab can't leave an unbounded open session behind
// (the 25h ghost session that prompted removing the admin exemption in May).
export const SAFETY_CEILING_SECONDS = 16 * 60 * 60; // 57600

/** True once a user's week-to-date total (incl. the live session) passes 15h. */
export function isOvertime(weekSecondsTotal: number): boolean {
  return weekSecondsTotal > WEEKLY_CAP_SECONDS;
}

/**
 * Server-side: the overtime portion of a just-finished session — the slice of
 * `durationSeconds` lying beyond the 15h weekly cap, given the user's already
 * completed seconds earlier this Mon–Sun week (`weekSecondsBefore`).
 */
export function computeOvertime(weekSecondsBefore: number, durationSeconds: number): {
  isOvertime: boolean;
  overtimeSeconds: number;
} {
  const overtimeSeconds = Math.max(
    0,
    Math.min(durationSeconds, weekSecondsBefore + durationSeconds - WEEKLY_CAP_SECONDS),
  );
  return { isOvertime: overtimeSeconds > 0, overtimeSeconds };
}

export type WeeklyBudget = {
  /** Total seconds counted against the cap (completed week + live session). */
  usedSeconds: number;
  /** Seconds left before the 15h cap, floored at zero. */
  remainingSeconds: number;
  /** The cap itself (15h), so callers don't re-import the constant. */
  capSeconds: number;
  /** Progress toward the cap, 0–100 (clamped). */
  percentUsed: number;
  isOvertime: boolean;
};

/**
 * Personal "how much of my 15h week is left" snapshot. Pure mirror of the
 * server-enforced weekly cap, shared by the clock widget and the dashboard
 * "My Hours" card so the personal view always matches enforcement.
 *
 * @param weekSecondsBefore completed (clocked-out) seconds this Mon–Sun week
 * @param elapsedSeconds    live seconds of the open session (0 when clocked out)
 */
export function weeklyBudget(weekSecondsBefore: number, elapsedSeconds = 0): WeeklyBudget {
  const usedSeconds = Math.max(0, weekSecondsBefore + elapsedSeconds);
  const remainingSeconds = Math.max(0, WEEKLY_CAP_SECONDS - usedSeconds);
  const percentUsed = Math.min(100, Math.round((usedSeconds / WEEKLY_CAP_SECONDS) * 100));
  return {
    usedSeconds,
    remainingSeconds,
    capSeconds: WEEKLY_CAP_SECONDS,
    percentUsed,
    isOvertime: usedSeconds > WEEKLY_CAP_SECONDS,
  };
}
