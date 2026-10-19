// Pure validation for the admin activity feed's optional ?userId= filter.
export function parseActivityUserId(
  raw: string | null,
): { ok: true; userId: number | null } | { ok: false } {
  if (raw == null || raw === '') return { ok: true, userId: null };
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return { ok: false };
  return { ok: true, userId: n };
}

// PostgREST `or` filter for the per-user audit feed: what the person did
// (actor) AND what was done to them (target). Only built from a validated
// positive integer, so nothing user-supplied reaches the filter string.
export function auditUserFilter(userId: number): string {
  if (!Number.isInteger(userId) || userId <= 0) throw new Error('auditUserFilter: invalid user id');
  return `actor_id.eq.${userId},target_user_id.eq.${userId}`;
}

// One field-level change in an activity entry's details dropdown. Values are
// display strings prepared on the server. When `hidden` is set, `from`/`to`
// are always null: 'private' = a private field (rate, birth date, email) whose
// values never leave the server; 'value' = a change we only name (a photo).
export interface ActivityChange {
  field: string;
  label: string;
  from: string | null;
  to: string | null;
  hidden?: 'private' | 'value';
}

const MINUTE_MS = 60_000;

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
}

// "just now" · "5 minutes ago" · "2 hours ago" · "3 days ago", then the
// Manila calendar date once the entry is 7 or more days old.
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const m = Math.floor((now.getTime() - then) / MINUTE_MS);
  if (m < 1) return 'just now';
  if (m < 60) return plural(m, 'minute');
  const h = Math.floor(m / 60);
  if (h < 24) return plural(h, 'hour');
  const d = Math.floor(h / 24);
  if (d < 7) return plural(d, 'day');
  const sameYear = new Date(then).toLocaleDateString('en-US', { year: 'numeric', timeZone: 'Asia/Manila' })
    === now.toLocaleDateString('en-US', { year: 'numeric', timeZone: 'Asia/Manila' });
  return new Date(then).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }), timeZone: 'Asia/Manila',
  });
}

// Exact timestamp in Manila time, same h:mm:ss AM style as the dashboard
// clock, e.g. "Oct 20, 2026, 12:55:03 AM PHT".
export function formatManilaDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
    timeZone: 'Asia/Manila',
  })} PHT`;
}
