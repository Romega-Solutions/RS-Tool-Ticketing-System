// PHT (Asia/Manila, UTC+8, no DST) work schedule ↔ US Pacific (America/Los_Angeles).
// The Pacific equivalent is derived live so the displayed PST/PDT always follows
// US daylight saving — the IANA tz database already encodes every scheduled DST
// transition, so this stays correct for the next 15+ years with no hand-coded
// rules. Nothing about PST is ever stored; only the PHT window is.

const PACIFIC_TZ = 'America/Los_Angeles';

/** 'HH:MM' 24-hour, 00:00–23:59. */
function isHhmm(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/**
 * Convert a PHT "HH:MM" wall-clock time to the equivalent US Pacific wall-clock
 * time on `refDate` (default: now). DST-aware: winter → PST (PHT − 16h), summer
 * → PDT (PHT − 15h). `refDate` only picks the calendar day used to resolve DST.
 */
export function phtToPacific(hhmm: string, refDate: Date = new Date()): { time: string; zone: 'PST' | 'PDT' } {
  const [h, m] = hhmm.split(':');
  // Anchor the PHT time to refDate's day, expressed as a concrete UTC instant.
  const y = refDate.getUTCFullYear();
  const mo = String(refDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(refDate.getUTCDate()).padStart(2, '0');
  const instant = new Date(`${y}-${mo}-${d}T${h}:${m}:00+08:00`);

  // h23 keeps midnight as "00:00" (not "24:00") across runtimes.
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TZ, hourCycle: 'h23', hour: '2-digit', minute: '2-digit',
  }).format(instant);

  const zonePart = new Intl.DateTimeFormat('en-US', { timeZone: PACIFIC_TZ, timeZoneName: 'short' })
    .formatToParts(instant).find(p => p.type === 'timeZoneName')?.value ?? 'PST';
  const zone: 'PST' | 'PDT' = zonePart === 'PDT' ? 'PDT' : 'PST';
  return { time, zone };
}

/** "21:00 - 00:00" from two PHT endpoints, or '' when either is missing. */
export function formatPhtRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return '';
  return `${start} - ${end}`;
}

/**
 * The Pacific range + zone for display ("05:00 - 08:00", "PST"), or null when
 * either PHT endpoint is missing or malformed. Each endpoint is converted with
 * the same reference day; on the ~2 DST-transition days/year a window straddling
 * 02:00 Pacific is off by an hour — negligible for a recurring schedule.
 */
export function pacificRange(
  start: string | null | undefined,
  end: string | null | undefined,
  refDate: Date = new Date(),
): { range: string; zone: 'PST' | 'PDT' } | null {
  if (!start || !end || !isHhmm(start) || !isHhmm(end)) return null;
  const a = phtToPacific(start, refDate);
  const b = phtToPacific(end, refDate);
  return { range: `${a.time} - ${b.time}`, zone: a.zone };
}
