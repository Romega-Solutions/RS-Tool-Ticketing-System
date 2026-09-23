// ─────────────────────────────────────────────────────────────────────────
// Attendance calendar dates are anchored to PHT (Asia/Manila, UTC+8, no DST):
// a "day" runs 12:00 AM – 11:59 PM Philippine time, and a week runs Mon–Sun in
// PHT. `timesheets.date` and `attendance.week_start` are keyed this way.
//
// Never derive a calendar date from an instant with the server's ambient
// timezone (Date#getDate/getDay/…, or toISOString().slice(0, 10)): Vercel runs
// in UTC, where the day flips at 8:00 AM PHT, so any earlier clock-in would be
// filed under the previous day. Instant → date goes through `phtDateOf`; pure
// YYYY-MM-DD arithmetic goes through the *Ymd helpers, which are UTC-based and
// therefore independent of the process timezone.
// ─────────────────────────────────────────────────────────────────────────

const PHT_OFFSET_MS = 8 * 3600 * 1000;
const DAY_MS = 86400000;

/** PHT calendar date (YYYY-MM-DD) of an instant. */
export function phtDateOf(instant: Date | string | number): string {
  const ms = new Date(instant).getTime();
  return new Date(ms + PHT_OFFSET_MS).toISOString().slice(0, 10);
}

/** Today's PHT calendar date (YYYY-MM-DD). */
export function phtToday(now: Date = new Date()): string {
  return phtDateOf(now);
}

/** Parses a YYYY-MM-DD string strictly; null for malformed or impossible dates (e.g. 2026-02-30). */
export function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return { y, m, d };
}

export function isValidYmd(ymd: string): boolean {
  return parseYmd(ymd) !== null;
}

/** Adds `days` (may be negative) to a YYYY-MM-DD date. */
export function addDaysYmd(ymd: string, days: number): string {
  const ms = Date.parse(ymd + 'T00:00:00Z');
  return new Date(ms + days * DAY_MS).toISOString().slice(0, 10);
}

/** Day of week (0 = Sunday … 6 = Saturday) of a YYYY-MM-DD date. */
export function dayOfWeekYmd(ymd: string): number {
  return new Date(ymd + 'T00:00:00Z').getUTCDay();
}

/** Monday (YYYY-MM-DD) of the Mon–Sun week containing a YYYY-MM-DD date. */
export function mondayOfYmd(ymd: string): string {
  const dow = dayOfWeekYmd(ymd);
  return addDaysYmd(ymd, dow === 0 ? -6 : 1 - dow);
}

/** Monday (YYYY-MM-DD) of the PHT Mon–Sun week containing an instant. */
export function phtWeekStartOf(instant: Date | string | number): string {
  return mondayOfYmd(phtDateOf(instant));
}

/** Every PHT calendar date an interval touches, inclusive of both ends. */
export function phtDatesTouched(startInstant: Date | string, endInstant: Date | string): string[] {
  const last = phtDateOf(endInstant);
  const out: string[] = [];
  for (let cur = phtDateOf(startInstant); cur <= last; cur = addDaysYmd(cur, 1)) out.push(cur);
  return out;
}
