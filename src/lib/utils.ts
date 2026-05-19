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

// ── Overtime guardrail ──────────────────────────────────────────────────────
// A continuous clock-in session is "overtime" once it reaches 3 hours.
// This single rule is shared by every clock/presence surface and the DB write.

export const OVERTIME_THRESHOLD_SECONDS = 3 * 60 * 60; // 10800

/** True once a live session's elapsed time has reached the 3h threshold. */
export function isOvertime(elapsedSeconds: number): boolean {
  return elapsedSeconds >= OVERTIME_THRESHOLD_SECONDS;
}

/** Server-side: derive the overtime flag + seconds from a completed session. */
export function computeOvertime(durationSeconds: number): {
  isOvertime: boolean;
  overtimeSeconds: number;
} {
  const over = isOvertime(durationSeconds);
  return {
    isOvertime: over,
    overtimeSeconds: over ? durationSeconds - OVERTIME_THRESHOLD_SECONDS : 0,
  };
}
