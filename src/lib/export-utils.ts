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

// ── Weekly Timesheet template ───────────────────────────────────────────────
// Mirrors the "Weekly Timesheet - Romega Solutions" export shape so the file
// can be dropped straight into the existing payroll workflow.

export interface TimesheetMemberRow {
  name: string;
  memberCode: string;
  /** Seconds per day, Mon→Sun (length 7). */
  daySeconds: number[];
  weekSeconds: number;
  /** Admin-set USD/hr rate. null when no rate has been assigned. */
  hourlyRateUsd: number | null;
}

export interface TimesheetMeta {
  /** e.g. "11 May 2026 - 17 May 2026" */
  weekRangeLabel: string;
  /** Per-day date headers, Mon→Sun (length 7), e.g. "May 11". */
  dayDateLabels: string[];
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

  lines.push(join(['Weekly Timesheets', '', '', '', '', '', '', '', '', '', '', '', 'Romega Solutions']));
  lines.push('');
  lines.push(join(['Week', meta.weekRangeLabel]));
  if (hasFx) {
    lines.push(join(['FX rate', `${fmtPhp(fx!.rate)} per $1 USD`, fx!.label]));
  }
  lines.push('');
  lines.push(join(['Legend', 'Public holiday', '', 'Rest day', '', 'Time off']));
  lines.push('');
  lines.push('');
  lines.push(join(['', '', '', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'SUN']));
  const phpHeaders = hasFx ? ['RATE (PHP)', 'GROSS (PHP)'] : [];
  lines.push(join(['NAME', 'MEMBER CODE', 'TYPE', ...meta.dayDateLabels, 'TOTALS', 'RATE (USD)', 'GROSS (USD)', ...phpHeaders]));

  const dayTotals = new Array(7).fill(0);
  let grandTotal = 0;
  let grandGross = 0;     // USD
  let grandGrossPhp = 0;  // PHP
  for (const r of rows) {
    const cells = r.daySeconds.map(fmtHm);
    const total = fmtHm(r.weekSeconds);
    // RATE + GROSS reflect the admin-set hourly rate:
    //   gross = (tracked seconds / 3600) × USD rate, then × live FX for PHP.
    const hasRate   = r.hourlyRateUsd != null;
    const grossUsd  = hasRate ? (r.weekSeconds / 3600) * r.hourlyRateUsd! : null;
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
    grandTotal += r.weekSeconds || 0;
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
  const dashes = ['-', '-', '-', '-', '-', '-', '-', '-'];
  for (const label of ['Daily OT', 'Double OT', 'Weekly OT', 'Rest Day OT', 'Public Holiday OT', 'Paid Time Off']) {
    lines.push(join(['', '', label, ...dashes]));
  }
  lines.push('');
  lines.push(join(['', '', 'Gross Pay (USD)', '', '', '', '', '', '', '', '', fmtUsd(grandGross)]));
  if (hasFx) {
    lines.push(join(['', '', 'Gross Pay (PHP)', '', '', '', '', '', '', '', '', fmtPhp(grandGrossPhp), `@ ${fmtPhp(fx!.rate)}/$1 · ${fx!.label}`]));
  }

  return lines.join('\n');
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

