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

export function buildTimesheetCsv(rows: TimesheetMemberRow[], meta: TimesheetMeta, fx?: FxSnapshot): string {
  const join = (arr: ExportCell[]) => arr.map(escapeCsvCell).join(',');
  const lines: string[] = [];
  const hasFx = !!fx && Number.isFinite(fx.rate) && fx.rate > 0;

  const dayCount = meta.dayDateLabels.length;

  lines.push(join(['Timesheets', '', 'Romega Solutions']));
  lines.push('');
  lines.push(join(['Period', meta.rangeLabel]));
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
  role: string;
  memberCode: string | null;
  hourlyRateUsd: number | null;
}

export interface CustomRangeExport {
  rows: ExportRow[];
  timesheet: { rows: TimesheetMemberRow[]; meta: TimesheetMeta };
  wiseAmounts: Record<string, number | null>;
  rangeLabel: string;
  jsonMeta: Record<string, unknown>;
  wisePaymentReference: string;
}

function shortDateLabel(iso: string): string {
  const d = parseIsoDate(iso);
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : iso;
}

function longDateLabel(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  return `${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'short' })} ${d.getFullYear()}`;
}

export function buildCustomRangeExport(
  start: string,
  end: string,
  users: CustomRangeApiUser[],
  timesheetsByDay: Record<string, number>,
): CustomRangeExport {
  const dates = datesBetween(start, end);
  const rangeLabel = `${longDateLabel(start)} - ${longDateLabel(end)}`;

  const rows: ExportRow[] = [];
  const timesheetRows: TimesheetMemberRow[] = [];
  const wiseAmounts: Record<string, number | null> = {};

  for (const u of users) {
    const daySeconds = dates.map(d => timesheetsByDay[`${u.id}:${d}`] ?? 0);
    const periodSeconds = daySeconds.reduce((a, b) => a + b, 0);
    timesheetRows.push({ name: u.name, memberCode: u.memberCode ?? '', daySeconds, periodSeconds, hourlyRateUsd: u.hourlyRateUsd });
    wiseAmounts[u.name] = u.hourlyRateUsd != null ? (periodSeconds / 3600) * u.hourlyRateUsd : null;
    rows.push({ member: u.name, team: u.team ?? '', period_total_hours: fmtHm(periodSeconds) });
  }

  return {
    rows,
    timesheet: {
      rows: timesheetRows,
      meta: { rangeLabel, dayDateLabels: dates.map(shortDateLabel), dayOfWeekLabels: dates.map(weekdayShortLabel) },
    },
    wiseAmounts,
    rangeLabel,
    jsonMeta: { start, end },
    wisePaymentReference: `Payroll Period ${rangeLabel}`,
  };
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

