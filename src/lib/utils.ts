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
