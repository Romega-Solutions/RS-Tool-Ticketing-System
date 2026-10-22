// SOW end-date alerts: pure date math and recipient rules (no I/O).
// The cron route (src/app/api/cron/sow-end-reminders/route.ts) does the
// Supabase reads/writes and the email send.
//
// Rules:
//   - users.end_date is 'YYYY-MM-DD' text. Anything else (or a real calendar
//     miss like 2026-02-30) is invalid and never emails.
//   - Milestones are 75, 60 and 45 days before end_date (Manila dates).
//   - A milestone that lands on Saturday or Sunday sends the next Monday.
//   - Each run sends every milestone whose send date is on or before today,
//     that has no reminder row yet, while it is still the "current" one
//     (days_left > the next milestone). If two are due at once, only the most
//     recent sends and the older one is recorded as skipped.
//   - A milestone whose send date is before the launch cutoff never emails
//     (no backfill at launch).

export const SOW_MILESTONES = [75, 60, 45] as const;
export type SowMilestone = (typeof SOW_MILESTONES)[number];

/** Badge threshold: "SOW ends in N days" shows when 0 <= days_left <= this. */
export const SOW_BADGE_WINDOW_DAYS = 75;
/** Under this many days the badge turns red. */
export const SOW_BADGE_URGENT_DAYS = 45;

const DAY_MS = 86_400_000;

/** Today's date (YYYY-MM-DD) in Asia/Manila. */
export function manilaToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

/** Parse a strict YYYY-MM-DD string to a UTC-midnight epoch ms, or null. */
export function parseIsoDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return ms;
}

function toIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const ms = parseIsoDate(iso);
  if (ms == null) throw new Error(`Invalid date: ${iso}`);
  return toIso(ms + days * DAY_MS);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number | null {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  if (a == null || b == null) return null;
  return Math.round((b - a) / DAY_MS);
}

/** Saturday → Monday (+2), Sunday → Monday (+1), weekdays unchanged. */
export function shiftWeekendToMonday(iso: string): string {
  const ms = parseIsoDate(iso);
  if (ms == null) throw new Error(`Invalid date: ${iso}`);
  const dow = new Date(ms).getUTCDay(); // 0 Sun … 6 Sat
  if (dow === 6) return toIso(ms + 2 * DAY_MS);
  if (dow === 0) return toIso(ms + DAY_MS);
  return iso;
}

/** The weekday the milestone email goes out on. */
export function milestoneSendDate(endDate: string, milestone: number): string {
  return shiftWeekendToMonday(addDays(endDate, -milestone));
}

export type MilestonePlan = {
  /** The milestone to send today, or null. */
  send: SowMilestone | null;
  /** Older milestones due at the same time; recorded as 'skipped'. */
  skip: SowMilestone[];
  daysLeft: number | null;
};

/**
 * Which milestone (if any) should go out today for this end date.
 * `alreadyRecorded` = milestones that already have a row for this end_date.
 * `launchCutoff` = earliest send date that may email (no backfill before it).
 */
export function planMilestone(
  endDate: string | null | undefined,
  today: string,
  alreadyRecorded: ReadonlySet<number> = new Set(),
  launchCutoff: string | null = null,
): MilestonePlan {
  const daysLeft = endDate ? daysBetween(today, endDate) : null;
  if (daysLeft == null || daysLeft <= 0) return { send: null, skip: [], daysLeft };

  const due: SowMilestone[] = [];
  SOW_MILESTONES.forEach((m, i) => {
    const next = SOW_MILESTONES[i + 1] ?? 0;
    if (daysLeft <= next) return;                 // no longer the current milestone
    if (alreadyRecorded.has(m)) return;           // dedupe
    const sendOn = milestoneSendDate(endDate as string, m);
    if (sendOn > today) return;                   // not yet
    if (launchCutoff && sendOn < launchCutoff) return; // no backfill at launch
    due.push(m);
  });
  if (!due.length) return { send: null, skip: [], daysLeft };
  // Smallest milestone = the most recent one. Older ones are skipped.
  const sorted = [...due].sort((a, b) => a - b);
  return { send: sorted[0], skip: sorted.slice(1), daysLeft };
}

export type SowBadge =
  | { kind: 'ending'; days: number; urgent: boolean; label: string }
  | { kind: 'ended'; label: string };

/** User Management badge for an end date, or null when none applies. */
export function sowBadge(endDate: string | null | undefined, today: string): SowBadge | null {
  if (!endDate || !endDate.trim()) return null;
  const days = daysBetween(today, endDate);
  if (days == null || days < 0) return { kind: 'ended', label: 'SOW ended' };
  if (days > SOW_BADGE_WINDOW_DAYS) return null;
  const label = days === 0 ? 'SOW ends today' : `SOW ends in ${days} day${days === 1 ? '' : 's'}`;
  return { kind: 'ending', days, urgent: days < SOW_BADGE_URGENT_DAYS, label };
}

/** True when the user belongs in the "SOW ending" filter (badge shown, not ended). */
export function isSowEnding(endDate: string | null | undefined, today: string): boolean {
  return sowBadge(endDate, today)?.kind === 'ending';
}

export type SowPerson = { id: number; email: string | null; isActive: boolean };

/**
 * CC list for one employee: the direct lead and the lead's own lead, from
 * user_reporting.reports_to_user_id. Inactive leads are skipped. When the
 * second level is missing, the CEO (founder) is CC'd instead.
 */
export function sowCcRecipients(
  userId: number,
  reportsTo: ReadonlyMap<number, number | null>,
  people: ReadonlyMap<number, SowPerson>,
  founderId: number | null,
): { ccIds: number[]; leadId: number | null; usedFounderFallback: boolean } {
  const active = (id: number | null | undefined): id is number =>
    id != null && id !== userId && Boolean(people.get(id)?.isActive);

  const lead = reportsTo.get(userId) ?? null;
  const leadId = active(lead) ? lead : null;
  const second = lead != null ? reportsTo.get(lead) ?? null : null;
  const secondId = active(second) ? second : null;

  const ids: number[] = [];
  if (leadId != null) ids.push(leadId);
  if (secondId != null) ids.push(secondId);
  let usedFounderFallback = false;
  if (secondId == null && active(founderId)) {
    usedFounderFallback = true;
    ids.push(founderId);
  }
  return { ccIds: [...new Set(ids)], leadId, usedFounderFallback };
}

export type SowAlertMode = 'off' | 'log' | 'send';

/** SOW_ALERTS_MODE: 'send' emails; 'off' does nothing; anything else is log-only. */
export function sowAlertMode(raw: string | undefined): SowAlertMode {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'send' || v === 'off') return v;
  return 'log';
}

/** Cron string → the Manila wall-clock time it fires at (fixed UTC+8, no DST). */
export function cronUtcToManila(schedule: string): { hour: number; minute: number; days: string } {
  const [min, hr, , , dow] = schedule.trim().split(/\s+/);
  return { hour: (Number(hr) + 8) % 24, minute: Number(min), days: dow };
}
