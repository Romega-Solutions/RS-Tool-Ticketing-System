import { phtDateOf, phtToday } from '@/lib/pht';

export type ExportCell = string | number | boolean | null | undefined;
export type ExportRow = Record<string, ExportCell>;

function stringifyCell(value: ExportCell): string {
  if (value == null) return '';
  return String(value);
}

function escapeCsvCell(value: ExportCell): string {
  const cell = stringifyCell(value);
  if (/[",\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

export function rowsToCsv(rows: ExportRow[]): string {
  if (rows.length === 0) return '';

  const headers = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
  const lines = [
    headers.join(','),
    ...rows.map(row => headers.map(header => escapeCsvCell(row[header])).join(',')),
  ];
  return lines.join('\n');
}

export function rowsToMarkdown(rows: ExportRow[]): string {
  if (rows.length === 0) return '_No data_';

  const headers = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
  const headerRow = `| ${headers.join(' | ')} |`;
  const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`;
  const bodyRows = rows.map(row => {
    const cells = headers.map(header => stringifyCell(row[header]).replace(/\n/g, '<br />').replace(/\|/g, '\\|'));
    return `| ${cells.join(' | ')} |`;
  });

  return [headerRow, separatorRow, ...bodyRows].join('\n');
}

// ── Date-range helpers (custom export ranges) ───────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function parseIsoDate(value: string): Date | null {
  if (!ISO_DATE_RE.test(value)) return null;
  const d = new Date(value + 'T00:00:00');
  // Reject overflowed calendar dates (e.g. 2026-13-40) which Date silently rolls forward.
  if (isNaN(d.getTime()) || toIsoDate(d) !== value) return null;
  return d;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** True when both are valid YYYY-MM-DD dates and `end` is on or after `start`. */
export function isValidDateRange(start: string, end: string): boolean {
  const s = parseIsoDate(start);
  const e = parseIsoDate(end);
  if (!s || !e) return false;
  return e.getTime() >= s.getTime();
}

/** Every ISO date from `start` to `end`, inclusive. Empty when the range is invalid. */
export function datesBetween(start: string, end: string): string[] {
  if (!isValidDateRange(start, end)) return [];
  const cur = parseIsoDate(start)!;
  const endTime = parseIsoDate(end)!.getTime();
  const out: string[] = [];
  // Advance via setDate (calendar-field arithmetic) rather than +86400000ms,
  // so this stays correct across DST transitions in timezones that observe it.
  while (cur.getTime() <= endTime) {
    out.push(toIsoDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** 'Mon' / 'Tue' / … for a YYYY-MM-DD date string. */
export function weekdayShortLabel(dateStr: string): string {
  const d = parseIsoDate(dateStr);
  return d ? WEEKDAY_SHORT[d.getDay()] : '';
}

// ── Weekly Timesheet template ───────────────────────────────────────────────
// Mirrors the "Weekly Timesheet - Romega Solutions" export shape so the file
// can be dropped straight into the existing payroll workflow.

export interface TimesheetMemberRow {
  /** users.id — people are matched by id, never by name. */
  id: number;
  name: string;
  memberCode: string;
  /** Seconds per day, aligned to TimesheetMeta.dayDateLabels/dayOfWeekLabels. */
  daySeconds: number[];
  periodSeconds: number;
  /** Admin-set USD/hr rate. null when no rate has been assigned. */
  hourlyRateUsd: number | null;
}

export interface TimesheetMeta {
  /** e.g. "11 May 2026 - 17 May 2026" */
  rangeLabel: string;
  /** Per-day date headers, e.g. "May 11". Any length — not necessarily a full week. */
  dayDateLabels: string[];
  /** Per-day weekday headers, aligned to dayDateLabels, e.g. "Mon". */
  dayOfWeekLabels: string[];
}

/** Live USD→PHP rate snapshot applied to the timesheet. */
export interface FxSnapshot {
  /** PHP per 1 USD. */
  rate: number;
  /** Human label, e.g. "live · as of May 19, 2026, 12:30 PM". */
  label: string;
}

/** "₱1,234.56" — PHP money cell. */
function fmtPhp(n: number): string {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "3h 01m" / "-" — matches the reference timesheet's cell format. */
function fmtHm(sec: number): string {
  if (!sec || sec <= 0) return '-';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** "$1,234.56" — USD money cell. */
function fmtUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function buildTimesheetCsv(rows: TimesheetMemberRow[], meta: TimesheetMeta, fx?: FxSnapshot, note?: string): string {
  const join = (arr: ExportCell[]) => arr.map(escapeCsvCell).join(',');
  const lines: string[] = [];
  const hasFx = !!fx && Number.isFinite(fx.rate) && fx.rate > 0;

  const dayCount = meta.dayDateLabels.length;

  lines.push(join(['Timesheets', '', 'Romega Solutions']));
  lines.push('');
  lines.push(join(['Period', meta.rangeLabel]));
  if (note) lines.push(join(['Note', note]));
  if (hasFx) {
    lines.push(join(['FX rate', `${fmtPhp(fx!.rate)} per $1 USD`, fx!.label]));
  }
  lines.push('');
  lines.push(join(['Legend', 'Public holiday', '', 'Rest day', '', 'Time off']));
  lines.push('');
  lines.push('');
  lines.push(join(['', '', '', ...meta.dayOfWeekLabels]));
  const phpHeaders = hasFx ? ['RATE (PHP)', 'GROSS (PHP)'] : [];
  lines.push(join(['NAME', 'MEMBER CODE', 'TYPE', ...meta.dayDateLabels, 'TOTALS', 'RATE (USD)', 'GROSS (USD)', ...phpHeaders]));

  const dayTotals = new Array(dayCount).fill(0);
  let grandTotal = 0;
  let grandGross = 0;     // USD
  let grandGrossPhp = 0;  // PHP
  for (const r of rows) {
    const cells = r.daySeconds.map(fmtHm);
    const total = fmtHm(r.periodSeconds);
    // RATE + GROSS reflect the admin-set hourly rate:
    //   gross = (tracked seconds / 3600) × USD rate, then × live FX for PHP.
    const hasRate   = r.hourlyRateUsd != null;
    const grossUsd  = hasRate ? (r.periodSeconds / 3600) * r.hourlyRateUsd! : null;
    const rateCell  = hasRate ? `${fmtUsd(r.hourlyRateUsd!)}/h` : '';
    const grossCell = grossUsd != null ? fmtUsd(grossUsd) : '';
    const phpCells: string[] = hasFx
      ? [
          hasRate ? `${fmtPhp(r.hourlyRateUsd! * fx!.rate)}/h` : '',
          grossUsd != null ? fmtPhp(grossUsd * fx!.rate) : '',
        ]
      : [];
    // Two TYPE rows per member, as in the reference. No payroll/regular split
    // exists in this app, so both carry the tracked hours; rate/pay sit on the
    // payroll row only to avoid double-counting gross.
    lines.push(join([r.name, r.memberCode, 'Payroll Hours', ...cells, total, rateCell, grossCell, ...phpCells]));
    lines.push(join(['', '', 'Regular Hours', ...cells, total, '', '', ...(hasFx ? ['', ''] : [])]));
    r.daySeconds.forEach((s, i) => { dayTotals[i] += s || 0; });
    grandTotal += r.periodSeconds || 0;
    if (grossUsd != null) {
      grandGross += grossUsd;
      if (hasFx) grandGrossPhp += grossUsd * fx!.rate;
    }
  }

  lines.push('');
  lines.push('');
  lines.push(join(['', '', 'Total Hours']));
  lines.push(join(['', '', 'Payroll', ...dayTotals.map(fmtHm), fmtHm(grandTotal), '', fmtUsd(grandGross), ...(hasFx ? ['', fmtPhp(grandGrossPhp)] : [])]));
  lines.push(join(['', '', 'Regular', ...dayTotals.map(fmtHm), fmtHm(grandTotal)]));
  const dashes = new Array(dayCount + 1).fill('-');
  for (const label of ['Daily OT', 'Double OT', 'Weekly OT', 'Rest Day OT', 'Public Holiday OT', 'Paid Time Off']) {
    lines.push(join(['', '', label, ...dashes]));
  }
  const trailingBlanks = new Array(dayCount + 1).fill('');
  lines.push('');
  lines.push(join(['', '', 'Gross Pay (USD)', ...trailingBlanks, fmtUsd(grandGross)]));
  if (hasFx) {
    lines.push(join(['', '', 'Gross Pay (PHP)', ...trailingBlanks, fmtPhp(grandGrossPhp), `@ ${fmtPhp(fx!.rate)}/$1 · ${fx!.label}`]));
  }

  return lines.join('\n');
}

// ── Custom date-range export ────────────────────────────────────────────────
// Shapes a /api/attendance?start=&end= response into everything the export
// sheet needs, independent of whatever week/month the page is currently on.

export interface CustomRangeApiUser {
  id: number;
  name: string;
  team: string | null;
  memberCode: string | null;
  hourlyRateUsd: number | null;
}

export interface CustomRangeApiSession {
  userId: number;
  date: string;
  clockedInAt: string;
  clockedOutAt: string | null;
}

export interface CustomRangeExport {
  /** Inclusive ISO range this export was built for. */
  start: string;
  end: string;
  rows: ExportRow[];
  /** User id → date → "09:05 - 17:30" (first clock-in, last clock-out), or "09:05 - Still clocked in". Days without sessions are absent. */
  dayLogs: Record<number, Record<string, string>>;
  timesheet: { rows: TimesheetMemberRow[]; meta: TimesheetMeta };
  wiseAmounts: Record<number, number | null>;
  /** Ids of people with a session still open in the range. Open time is not in any total. */
  openUserIds: number[];
  /** One entry per row in `rows`, same order: the user each row belongs to. */
  rowUserIds: number[];
  rangeLabel: string;
  jsonMeta: Record<string, unknown>;
  wisePaymentReference: string;
}

function shortDateLabel(iso: string): string {
  const d = parseIsoDate(iso);
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : iso;
}

export const UNKNOWN_TIME = 'Unknown time';
export const STILL_CLOCKED_IN = 'Still clocked in';

/** "17:30" — 24-hour Manila time, or "Unknown time" for a value that is not a date. */
function fmtClock(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return UNKNOWN_TIME;
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Manila' });
}

/** A session is open when it has no clock-out (null, or empty/whitespace text). */
export function isOpenSession(clockedOutAt: string | null | undefined): boolean {
  return clockedOutAt == null || clockedOutAt.trim() === '';
}

/** Whole Manila calendar days between a day (YYYY-MM-DD) and the day an instant falls on; null if the instant is invalid. */
function manilaDaysAfter(date: string, iso: string): number | null {
  if (isNaN(new Date(iso).getTime())) return null;
  return Math.round((Date.parse(phtDateOf(iso) + 'T00:00:00Z') - Date.parse(date + 'T00:00:00Z')) / 86400000);
}

/** Date (YYYY-MM-DD) used in export file names: today in Manila, not UTC. */
export function exportDateSuffix(now: Date = new Date()): string {
  return phtToday(now);
}

function longDateLabel(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  return `${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'short' })} ${d.getFullYear()}`;
}

/**
 * Why a /api/attendance?start=&end= reply must not be exported, or null when it
 * is safe. Only a reply the server marked `complete: true` may become a file.
 */
export function rangeReplyError(reply: { error?: string; complete?: boolean }): string | null {
  if (reply.error) return reply.error;
  if (reply.complete !== true) return "Couldn't load the full range. Please try again.";
  return null;
}

export function buildCustomRangeExport(
  start: string,
  end: string,
  users: CustomRangeApiUser[],
  timesheetsByDay: Record<string, number>,
  sessions: CustomRangeApiSession[] = [],
): CustomRangeExport {
  const dates = datesBetween(start, end);
  const rangeLabel = `${longDateLabel(start)} - ${longDateLabel(end)}`;

  const rows: ExportRow[] = [];
  const rowUserIds: number[] = [];
  const timesheetRows: TimesheetMemberRow[] = [];
  const wiseAmounts: Record<number, number | null> = {};

  for (const u of users) {
    const daySeconds = dates.map(d => timesheetsByDay[`${u.id}:${d}`] ?? 0);
    const periodSeconds = daySeconds.reduce((a, b) => a + b, 0);
    timesheetRows.push({ id: u.id, name: u.name, memberCode: u.memberCode ?? '', daySeconds, periodSeconds, hourlyRateUsd: u.hourlyRateUsd });
    wiseAmounts[u.id] = u.hourlyRateUsd != null ? (periodSeconds / 3600) * u.hourlyRateUsd : null;
    rows.push({ member: u.name, team: u.team ?? '', period_total_hours: fmtHm(periodSeconds) });
    rowUserIds.push(u.id);
  }

  // Sessions arrive ordered by clock-in, so the first one per day is the time
  // in and the last one's clock-out is the time out. Any open session makes the
  // whole day "Still clocked in".
  const firstLast = new Map<string, { in: string; out: string | null; open: boolean }>();
  const openIds = new Set<number>();
  for (const s of sessions) {
    const key = `${s.userId}:${s.date}`;
    const prev = firstLast.get(key);
    const open = isOpenSession(s.clockedOutAt);
    if (open) openIds.add(s.userId);
    firstLast.set(key, { in: prev?.in ?? s.clockedInAt, out: s.clockedOutAt, open: open || !!prev?.open });
  }
  const dayLogs: Record<number, Record<string, string>> = {};
  for (const u of users) {
    const days: Record<string, string> = {};
    for (const d of dates) {
      const day = firstLast.get(`${u.id}:${d}`);
      if (!day) continue;
      if (day.open) {
        days[d] = `${fmtClock(day.in)} - ${STILL_CLOCKED_IN}`;
      } else {
        const out = fmtClock(day.out ?? '');
        const after = day.out ? manilaDaysAfter(d, day.out) : null;
        days[d] = `${fmtClock(day.in)} - ${out}${after != null && after > 0 ? ` (+${after})` : ''}`;
      }
    }
    dayLogs[u.id] = days;
  }

  return {
    start,
    end,
    rows,
    rowUserIds,
    dayLogs,
    timesheet: {
      rows: timesheetRows,
      meta: { rangeLabel, dayDateLabels: dates.map(shortDateLabel), dayOfWeekLabels: dates.map(weekdayShortLabel) },
    },
    wiseAmounts,
    openUserIds: users.filter(u => openIds.has(u.id)).map(u => u.id),
    rangeLabel,
    jsonMeta: { start, end },
    wisePaymentReference: `Payroll Period ${rangeLabel}`,
  };
}

/** First and last day (YYYY-MM-DD) of a "YYYY-MM" month. */
export function monthDateRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const first = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: first, end: `${first.slice(0, 8)}${String(last).padStart(2, '0')}` };
}

// ── Optional columns ────────────────────────────────────────────────────────

/** Panel defaults. Attendance notes are free text and can be sensitive, so they are opt-in. */
export const EXPORT_DEFAULTS = { includeNotes: false } as const;

/** True when a column is switched off: notes and weekend hours (weekly only), totals (any mode). */
export function isExcludedColumn(
  key: string,
  opts: { mode: 'weekly' | 'monthly'; includeNotes: boolean; includeWeekendHours: boolean; includeTotals: boolean },
): boolean {
  if (opts.mode === 'weekly' && !opts.includeNotes && key === 'notes') return true;
  if (opts.mode === 'weekly' && !opts.includeWeekendHours && (key === 'saturday_hours' || key === 'sunday_hours')) return true;
  if (!opts.includeTotals && (key === 'week_total_hours' || key === 'total_hours')) return true;
  return false;
}

// ── People are matched by id; names are display text only ───────────────────

export interface ExportMember {
  userId: number;
  name: string;
  memberCode?: string | null;
}

/**
 * Display label per user id. A name shared by two or more people in the same
 * export becomes "Name (member code)", or "Name (#id)" without a code; unique
 * names are left exactly as they are.
 */
export function memberLabels(members: ExportMember[]): Map<number, string> {
  const nameKey = (n: string) => n.trim().toLowerCase();
  const counts = new Map<string, number>();
  for (const m of members) counts.set(nameKey(m.name), (counts.get(nameKey(m.name)) ?? 0) + 1);
  const labels = new Map<number, string>();
  for (const m of members) {
    const shared = (counts.get(nameKey(m.name)) ?? 0) > 1;
    const code = m.memberCode?.trim();
    labels.set(m.userId, shared ? `${m.name} (${code ? code : `#${m.userId}`})` : m.name);
  }
  return labels;
}

/** Names that more than one of these people share (trimmed, case-insensitive). */
export function duplicateNames(members: ExportMember[]): string[] {
  const seen = new Map<string, { name: string; n: number }>();
  for (const m of members) {
    const key = m.name.trim().toLowerCase();
    const cur = seen.get(key);
    seen.set(key, { name: cur?.name ?? m.name, n: (cur?.n ?? 0) + 1 });
  }
  return [...seen.values()].filter(v => v.n > 1).map(v => v.name);
}

// ── Open sessions ───────────────────────────────────────────────────────────

/** Amber warning for the panel, and the note line written into the files. Null when nobody is open. */
export function openSessionsNote(count: number): string | null {
  if (count <= 0) return null;
  return count === 1
    ? "1 person is still clocked in. Their current shift isn't included in hours or pay."
    : `${count} people are still clocked in. Their current shift isn't included in hours or pay.`;
}

// ── Which CSV template may be used ──────────────────────────────────────────

export type CsvTemplateName = 'standard' | 'timesheet' | 'wise';

/**
 * The template a download may actually use. The Wise payout file is a pay file:
 * it is granted only when `allowPayout` is exactly true (admins), whatever the
 * UI asked for. The timesheet template needs timesheet data. Non-CSV formats
 * always use the standard shape.
 */
export function resolveCsvTemplate(
  format: 'csv' | 'md' | 'json',
  requested: CsvTemplateName,
  opts: { allowPayout?: boolean; canTimesheet?: boolean },
): CsvTemplateName {
  if (format !== 'csv') return 'standard';
  if (requested === 'wise') return opts.allowPayout === true ? 'wise' : 'standard';
  if (requested === 'timesheet') return opts.canTimesheet ? 'timesheet' : 'standard';
  return 'standard';
}

export const WISE_STILL_CLOCKED_IN_MESSAGE = (count: number) =>
  `The Wise file can't be created yet: ${count === 1 ? '1 selected person is' : `${count} selected people are`} still clocked in. Try again after they clock out.`;

export const WISE_SHARED_NAME_MESSAGE = (names: string[]) =>
  `The Wise file can't be created until names are told apart: more than one selected person is named ${names.map(n => `"${n}"`).join(', ')}. Deselect one, or export a different template.`;

export const WISE_UNCHECKED_MESSAGE =
  "The Wise file can't be created until we have checked who is still clocked in. Please wait for the data to load, or try again.";

/**
 * Why the Wise file must not be created for these selected people, or null when
 * it may be. `openUserIds` is null when who is still clocked in is not known.
 */
export function wiseBlockReason(selected: ExportMember[], openUserIds: number[] | null): string | null {
  if (openUserIds === null) return WISE_UNCHECKED_MESSAGE;
  const open = new Set(openUserIds);
  const stillIn = selected.filter(m => open.has(m.userId)).length;
  if (stillIn > 0) return WISE_STILL_CLOCKED_IN_MESSAGE(stillIn);
  const dup = duplicateNames(selected);
  if (dup.length > 0) return WISE_SHARED_NAME_MESSAGE(dup);
  return null;
}

// ── Wise bulk-payout template ───────────────────────────────────────────────
// Matches the "Selected-recipients" Wise upload columns. `amount` is now the
// computed USD gross (tracked hours × the member's USD rate); it is left blank
// only when the member has no rate set. recipientId stays blank — the app has
// no Wise recipient-ID mapping — so confirm recipients before sending.

export interface WiseMeta {
  paymentReference: string;
}

export interface WiseRecipient {
  name: string;
  /** USD gross for the period, or null when the member has no rate. */
  amountUsd: number | null;
}

export function buildWiseCsv(recipients: WiseRecipient[], meta: WiseMeta): string {
  const join = (arr: ExportCell[]) => arr.map(escapeCsvCell).join(',');
  const lines = [
    'recipientId,name,recipientEmail,recipientDetail,sourceCurrency,targetCurrency,amountCurrency,amount,paymentReference,receiverType',
    ...recipients.map(r =>
      join([
        '', r.name, '', 'Wise account', 'USD', 'Php', 'source',
        r.amountUsd != null ? r.amountUsd.toFixed(2) : '',
        meta.paymentReference, 'PERSON',
      ]),
    ),
  ];
  return lines.join('\n');
}

export function downloadTextFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

