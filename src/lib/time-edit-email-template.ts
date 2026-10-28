// The five time-correction emails (pure, no I/O):
//   received            the request was filed
//   supervisor_approved the supervisor approved; it now waits on an admin
//   approved            an admin approved and the timesheet was updated
//   declined_admin      an admin declined (final)
//   declined_supervisor the supervisor declined (final)
// Layout: table based, inline styles, one font stack, a hidden preheader and a
// plain-text twin that carries the same facts. All dates and times are Manila.

import { dayOfWeekYmd, parseYmd } from '@/lib/pht';
import { parseDbTimestamp } from '@/lib/time-approvals';

/** The one font stack used by every style in these emails. */
export const EMAIL_FONT_STACK = "'Poppins', Arial, Helvetica, sans-serif";
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap';
const LOGO_PATH = '/images/rs-logo.png';

const YELLOW = '#febd18';
const ACTION = '#1c5fa5';
const TEXT = '#334155';
const NAVY = '#1e293b';
const MUTED = '#64748b';
const PAGE = '#f1f5f9';
const LINE = '#e2e8f0';
const CARD = '#f7fbff';
const FOOT_BG = '#0f2238';
const FOOT_TXT = '#d4e9f7';
const FOOT_HI = '#ffffff';

export type TimeEditEmailKind =
  | 'received'
  | 'supervisor_approved'
  | 'approved'
  | 'declined_admin'
  | 'declined_supervisor';

export type TimeEditEmailData = {
  kind: TimeEditEmailKind;
  /** Public base URL used for the logo and the button (no trailing slash). */
  baseUrl: string;
  requesterName: string;
  /** The shift's calendar date, YYYY-MM-DD. */
  shiftDate: string;
  /** Times on the timesheet when the request was filed (ISO instants). */
  currentClockIn: string | null;
  currentClockOut: string | null;
  /** Requested times (ISO instants); null leaves that side unchanged. */
  requestedClockIn: string | null;
  requestedClockOut: string | null;
  reason: string;
  /** Supporting file name, or null when none was attached. */
  documentName: string | null;
  /** When the request was filed (ISO or database timestamp text). */
  filedAt: string | null;
  /** Who is expected to decide next, for `received`. */
  waitingFor?: 'supervisor' | 'admin';
  /** The requester's supervisor, when one is recorded. */
  supervisorName?: string | null;
  /** Who made the decision (for approved / declined / supervisor_approved). */
  deciderName?: string | null;
  /** The decider's note. */
  note?: string | null;
  /** True when the supervisor is copied on this email. */
  supervisorCopied: boolean;
};

export type RenderedTimeEditEmail = {
  subject: string;
  preheader: string;
  html: string;
  text: string;
};

// ── helpers ────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escMultiline(s: string): string {
  return esc(s).replace(/\r?\n/g, '<br>');
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MANILA_OFFSET_MS = 8 * 3600 * 1000;

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = parseDbTimestamp(value) ?? new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** Manila wall-clock parts of an instant (fixed UTC+8, independent of the server zone). */
function manilaParts(d: Date) {
  const m = new Date(d.getTime() + MANILA_OFFSET_MS);
  const h24 = m.getUTCHours();
  return {
    weekday: WEEKDAYS[m.getUTCDay()],
    month: MONTHS[m.getUTCMonth()],
    day: m.getUTCDate(),
    year: m.getUTCFullYear(),
    hour12: h24 % 12 === 0 ? 12 : h24 % 12,
    minute: String(m.getUTCMinutes()).padStart(2, '0'),
    ampm: h24 < 12 ? 'AM' : 'PM',
  };
}

export function fmtManilaDate(d: Date): string {
  const p = manilaParts(d);
  return `${p.weekday}, ${p.month} ${p.day}, ${p.year}`;
}

export function fmtManilaTime(d: Date): string {
  const p = manilaParts(d);
  return `${p.hour12}:${p.minute} ${p.ampm}`;
}

export function fmtManilaDateTime(d: Date): string {
  return `${fmtManilaDate(d)}, ${fmtManilaTime(d)}`;
}

/** YYYY-MM-DD → "Fri, Oct 9, 2026". Falls back to the raw text when malformed. */
export function fmtShiftDate(ymd: string): string {
  const p = parseYmd(ymd);
  if (!p) return ymd;
  return `${WEEKDAYS[dayOfWeekYmd(ymd)]}, ${MONTHS[p.m - 1]} ${p.d}, ${p.y}`;
}

export function fmtDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60));
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, '0')} min`;
}

type Side = { date: string; time: string } | null;
type TimesRow = { clockIn: Side; clockOut: Side; total: string; inChanged: boolean; outChanged: boolean };

function side(d: Date | null): Side {
  return d ? { date: fmtManilaDate(d), time: fmtManilaTime(d) } : null;
}

function computeTimes(data: TimeEditEmailData): { original: TimesRow; requested: TimesRow } {
  const curIn = toDate(data.currentClockIn);
  const curOut = toDate(data.currentClockOut);
  const reqIn = toDate(data.requestedClockIn);
  const reqOut = toDate(data.requestedClockOut);
  const effIn = reqIn ?? curIn;
  const effOut = reqOut ?? curOut;
  const total = (a: Date | null, b: Date | null) =>
    a && b ? fmtDuration((b.getTime() - a.getTime()) / 1000) : 'Not available';
  return {
    original: {
      clockIn: side(curIn), clockOut: side(curOut), total: total(curIn, curOut),
      inChanged: false, outChanged: false,
    },
    requested: {
      clockIn: side(effIn), clockOut: side(effOut), total: total(effIn, effOut),
      inChanged: !!reqIn && reqIn.getTime() !== curIn?.getTime(),
      outChanged: !!reqOut && reqOut.getTime() !== curOut?.getTime(),
    },
  };
}

function sideText(s: Side): string {
  return s ? `${s.date}, ${s.time}` : 'Not recorded';
}

// ── content per kind ───────────────────────────────────────────────────────

type Chip = 'wait_supervisor' | 'wait_admin' | 'approved' | 'declined';

const CHIP: Record<Chip, { label: string; bg: string; fg: string }> = {
  wait_supervisor: { label: 'Waiting for supervisor approval', bg: '#fff0cb', fg: '#8a5a00' },
  wait_admin:      { label: 'Waiting for admin approval',      bg: '#fff0cb', fg: '#8a5a00' },
  approved:        { label: 'Approved',                        bg: '#dcfce7', fg: '#166534' },
  declined:        { label: 'Declined',                        bg: '#fee2e2', fg: '#991b1b' },
};

type Row = { label: string; html: string; text: string };

function textRow(label: string, value: string): Row {
  return { label, html: esc(value), text: value };
}

function quoted(note: string): Row['html'] {
  return `&ldquo;${escMultiline(note)}&rdquo;`;
}

type Spec = {
  subject: string;
  headline: string;
  preheader: string;
  chip: Chip;
  rows: Row[];
  /** A highlighted reason block (declines). */
  noteBlock?: { title: string; who: string; text: string };
  button: string;
};

function filedRows(data: TimeEditEmailData, requestUrl: string): Row[] {
  const rows: Row[] = [textRow('Reason', data.reason)];
  if (data.documentName) {
    rows.push({
      label: 'Supporting file',
      html:
        `${esc(data.documentName)} &middot; ` +
        `<a href="${esc(requestUrl)}" style="color:${ACTION};text-decoration:underline">Open it in the portal</a>`,
      text: `${data.documentName} (open it in the portal)`,
    });
  }
  const filed = toDate(data.filedAt);
  if (filed) rows.push(textRow('Filed', fmtManilaDateTime(filed)));
  return rows;
}

function buildSpec(data: TimeEditEmailData, requestUrl: string): Spec {
  const employee: Row[] = [
    textRow('Employee', data.requesterName),
    textRow('Shift date', fmtShiftDate(data.shiftDate)),
  ];
  const decider = (data.deciderName ?? '').trim() || 'Your approver';
  const note = (data.note ?? '').trim();

  switch (data.kind) {
    case 'received': {
      const adminStep = data.waitingFor === 'admin';
      const rows = [...employee];
      if (!adminStep && data.supervisorName) rows.push(textRow('Supervisor', data.supervisorName));
      rows.push(...filedRows(data, requestUrl));
      return {
        subject: 'We received your time correction request',
        headline: 'We received your time correction request',
        preheader: 'We received your time correction request.',
        chip: adminStep ? 'wait_admin' : 'wait_supervisor',
        rows,
        button: 'View my request',
      };
    }
    case 'supervisor_approved': {
      const rows = [...employee, textRow('Approved by', `${decider}, supervisor`)];
      if (note) rows.push({ label: 'Supervisor note', html: quoted(note), text: `"${note}"` });
      rows.push(...filedRows(data, requestUrl));
      return {
        subject: 'Your supervisor approved your request',
        headline: 'Your supervisor approved your request',
        preheader: 'Your supervisor approved your request. It now needs an admin.',
        chip: 'wait_admin',
        rows,
        button: 'View my request',
      };
    }
    case 'approved': {
      const rows = [...employee, textRow('Approved by', `${decider}, admin`)];
      if (note) rows.push({ label: 'Admin note', html: quoted(note), text: `"${note}"` });
      return {
        subject: 'Your time correction was approved',
        headline: 'Your time correction was approved',
        preheader: 'Approved. Your timesheet was updated.',
        chip: 'approved',
        rows,
        button: 'View my timesheet',
      };
    }
    case 'declined_admin':
      return {
        subject: 'Your time correction was declined by an admin',
        headline: 'Your time correction was declined',
        preheader: 'Your time correction was declined. See the reason inside.',
        chip: 'declined',
        rows: [...employee, textRow('Declined by', `${decider}, admin`)],
        noteBlock: note ? { title: 'Reason', who: 'Admin', text: note } : undefined,
        button: 'View my request',
      };
    case 'declined_supervisor':
      return {
        subject: 'Your time correction was declined by your supervisor',
        headline: 'Your time correction was declined',
        preheader: 'Your supervisor declined your request. See the reason inside.',
        chip: 'declined',
        rows: [...employee, textRow('Declined by', `${decider}, supervisor`)],
        noteBlock: note ? { title: 'Reason', who: 'Supervisor', text: note } : undefined,
        button: 'View my request',
      };
  }
}

// ── HTML pieces ────────────────────────────────────────────────────────────

const F = `font-family:${EMAIL_FONT_STACK}`;

function chipHtml(chip: Chip): string {
  const c = CHIP[chip];
  return (
    `<span style="display:inline-block;padding:5px 14px;border-radius:999px;background:${c.bg};color:${c.fg};` +
    `font-size:12px;font-weight:700;letter-spacing:.3px;text-transform:uppercase">${esc(c.label)}</span>`
  );
}

function rowHtml(r: Row): string {
  return (
    `<tr><td width="130" valign="top" style="padding:7px 12px 7px 0;font-size:13px;font-weight:700;color:${MUTED}">${esc(r.label)}</td>` +
    `<td valign="top" style="padding:7px 0;font-size:14px;line-height:1.5;color:${NAVY}">${r.html}</td></tr>`
  );
}

function tagHtml(changed: boolean): string {
  const bg = changed ? YELLOW : LINE;
  const fg = changed ? NAVY : MUTED;
  return (
    `<span style="display:inline-block;white-space:nowrap;margin-top:5px;padding:2px 8px;border-radius:999px;` +
    `background:${bg};color:${fg};font-size:10px;font-weight:700;letter-spacing:.4px;text-transform:uppercase">` +
    `${changed ? 'Changed' : 'No change'}</span>`
  );
}

function timeCell(s: Side, changed: boolean, showTag: boolean): string {
  const body = s
    ? `<div style="font-size:12px;color:${MUTED};line-height:1.4">${esc(s.date)}</div>` +
      `<div style="font-size:16px;font-weight:700;color:${changed ? ACTION : NAVY};line-height:1.4">${esc(s.time)}</div>`
    : `<div style="font-size:14px;color:${MUTED};line-height:1.4">Not recorded</div>`;
  return (
    `<td valign="top" style="padding:10px;border-top:1px solid ${LINE}">${body}` +
    `${showTag && s ? tagHtml(changed) : ''}</td>`
  );
}

function timesTableHtml(original: TimesRow, requested: TimesRow): string {
  const th = `padding:8px 10px;font-size:11px;font-weight:700;color:${MUTED};text-align:left;text-transform:uppercase;letter-spacing:.5px;background:${CARD}`;
  const lab = (s: string) =>
    `<td valign="top" style="padding:10px;border-top:1px solid ${LINE};font-size:13px;font-weight:700;color:${NAVY}">${s}</td>`;
  const tot = (s: string, bold: boolean) =>
    `<td valign="top" style="padding:10px;border-top:1px solid ${LINE};font-size:14px;font-weight:700;line-height:1.4;color:${bold ? ACTION : NAVY}">${esc(s)}</td>`;
  const changedTotal = original.total !== requested.total;
  return (
    `<table class="tt" role="presentation" cellpadding="0" cellspacing="0" width="100%" ` +
    `style="border:1px solid ${LINE};border-radius:10px;border-collapse:separate;border-spacing:0;background:#ffffff">` +
    `<tr><td style="${th}"></td><td style="${th}">Clock in</td><td style="${th}">Clock out</td><td style="${th}">Total time</td></tr>` +
    `<tr>${lab('Original')}${timeCell(original.clockIn, false, false)}${timeCell(original.clockOut, false, false)}${tot(original.total, false)}</tr>` +
    `<tr>${lab('Requested')}${timeCell(requested.clockIn, requested.inChanged, true)}${timeCell(requested.clockOut, requested.outChanged, true)}${tot(requested.total, changedTotal)}</tr>` +
    `</table>` +
    `<div style="font-size:12px;color:${MUTED};margin-top:8px;line-height:1.5;text-align:center"><i>All dates and times are Manila time (UTC+8).</i></div>`
  );
}

function noteBlockHtml(b: NonNullable<Spec['noteBlock']>): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:14px"><tr>` +
    `<td width="4" style="background:#dc2626;border-radius:2px">&nbsp;</td>` +
    `<td style="padding:10px 14px;background:${CARD};font-size:14px;line-height:1.55;color:${NAVY}">` +
    `<div style="font-size:12px;font-weight:700;color:${MUTED};margin-bottom:3px">${esc(b.title)} &middot; ${esc(b.who)}</div>` +
    `${escMultiline(b.text)}</td></tr></table>`
  );
}

function buttonHtml(url: string, label: string): string {
  const shown = url.replace(/^https?:\/\//, '');
  return (
    `<div style="text-align:center;margin:26px 0 0">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto"><tr>` +
    `<td align="center" style="border-radius:999px;background:${ACTION}">` +
    `<a href="${esc(url)}" style="display:inline-block;padding:13px 30px;${F};font-size:14px;font-weight:700;letter-spacing:.4px;` +
    `text-transform:uppercase;color:#ffffff;text-decoration:none;border-radius:999px">${esc(label)}</a></td></tr></table></div>` +
    `<div style="text-align:center;font-size:11px;color:${MUTED};margin-top:12px;line-height:1.7"><i>Button not working? Copy this link: ` +
    `<span style="white-space:nowrap"><a href="${esc(url)}" style="color:${ACTION}">${esc(shown)}</a></span></i></div>`
  );
}

const ADDRESS = '222 Pacific Coast Hwy, #10, El Segundo, CA 90245';
const SITE = 'https://www.romega-solutions.com';

function whyLine(copied: boolean): string {
  return (
    'You are getting this email because a time correction request was filed in your name.' +
    `${copied ? ' Your supervisor is copied.' : ''} Please do not reply to this automated message.`
  );
}

// ── public API ─────────────────────────────────────────────────────────────

export function renderTimeEditEmail(data: TimeEditEmailData): RenderedTimeEditEmail {
  const base = data.baseUrl.replace(/\/+$/, '');
  const requestUrl = `${base}/my-time`;
  const logoUrl = `${base}${LOGO_PATH}`;
  const spec = buildSpec(data, requestUrl);
  const { original, requested } = computeTimes(data);
  const why = whyLine(data.supervisorCopied);

  const rowsHtml = spec.rows.map(rowHtml).join('');
  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${esc(spec.subject)}</title>` +
    `<link href="${FONT_HREF}" rel="stylesheet">` +
    `<style>@media only screen and (max-width:440px){.px{padding-left:16px !important;padding-right:16px !important}` +
    `.tt td{padding:8px 3px !important}}</style></head>` +
    `<body style="margin:0;background:${PAGE};${F};color:${NAVY}">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${PAGE}" style="background:${PAGE}"><tr>` +
    `<td align="center" style="padding:24px 12px">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PAGE}">${esc(spec.preheader)}</div>` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;` +
    `border:1px solid ${LINE};border-radius:14px;border-collapse:separate;overflow:hidden;${F}">` +
    `<tr><td style="padding:22px 32px 16px;border-bottom:4px solid ${YELLOW}">` +
    `<a href="${SITE}"><img src="${esc(logoUrl)}" width="190" height="53" alt="Romega Solutions" ` +
    `style="display:block;border:0;width:190px;height:auto"></a></td></tr>` +
    `<tr><td class="px" style="padding:30px 32px 28px;${F};color:${TEXT}">` +
    `<div style="text-align:center;${F};font-size:26px;line-height:1.3;font-weight:700;color:${NAVY};margin:0 0 14px">${esc(spec.headline)}</div>` +
    `<div style="text-align:center;margin:0 0 22px">${chipHtml(spec.chip)}</div>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ${LINE};border-radius:10px;` +
    `border-collapse:separate;background:${CARD}"><tr><td style="padding:8px 16px">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${rowsHtml}</table></td></tr></table>` +
    `<div style="margin-top:14px">${timesTableHtml(original, requested)}</div>` +
    `${spec.noteBlock ? noteBlockHtml(spec.noteBlock) : ''}` +
    `${buttonHtml(requestUrl, spec.button)}` +
    `</td></tr>` +
    `<tr><td bgcolor="${FOOT_BG}" align="center" class="px" style="background-color:${FOOT_BG};padding:28px 32px;${F}">` +
    `<p style="margin:0;${F};font-size:14px;line-height:22px;font-weight:700;color:${FOOT_HI}">Romega Solutions</p>` +
    `<p style="margin:4px 0 0;${F};font-size:13px;line-height:21px;color:${FOOT_TXT}">${esc(ADDRESS)}</p>` +
    `<p style="margin:8px 0 0;${F};font-size:13px;line-height:21px;color:${FOOT_TXT}">` +
    `<a href="${SITE}" target="_blank" style="color:${FOOT_HI};text-decoration:underline">www.romega-solutions.com</a></p>` +
    `<p style="margin:14px 0 0;${F};font-size:12px;line-height:19px;color:${FOOT_TXT}">${esc(why)}</p>` +
    `</td></tr></table></td></tr></table></body></html>`;

  const pad = (label: string) => `${label}:`.padEnd(17);
  const lines: string[] = [spec.headline, `[${CHIP[spec.chip].label}]`, ''];
  for (const r of spec.rows) lines.push(`${pad(r.label)}${r.text}`);
  if (spec.noteBlock) lines.push(`${pad(spec.noteBlock.title)}"${spec.noteBlock.text}"`);
  lines.push('');
  const tline = (name: string, t: TimesRow, tags: boolean) =>
    `${pad(name)}Clock in  ${sideText(t.clockIn)}${tags ? (t.inChanged ? ' (CHANGED)' : ' (no change)') : ''}` +
    ` | Clock out ${sideText(t.clockOut)}${tags ? (t.outChanged ? ' (CHANGED)' : ' (no change)') : ''}` +
    ` | Total ${t.total}`;
  lines.push(tline('Original', original, false));
  lines.push(tline('Requested', requested, true));
  lines.push('All dates and times are Manila time (UTC+8).', '');
  lines.push(`${spec.button}: ${requestUrl}`);
  lines.push(`Button not working? Copy this link: ${requestUrl}`, '');
  lines.push('--', 'Romega Solutions', ADDRESS, 'www.romega-solutions.com', '', why, '');

  return { subject: spec.subject, preheader: spec.preheader, html, text: lines.join('\n') };
}
