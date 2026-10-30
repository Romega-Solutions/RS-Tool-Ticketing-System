// Duplicate-application rule for the candidates table.
//
// A new application is a duplicate when an earlier candidate has the same
// email and the same position title (both compared as lower(trim(...))) and
// that earlier candidate is still open, i.e. its status is not one of the
// closed statuses below. There is no time window: once the earlier
// application is closed, the person can apply again straight away.
//
// The same rule is enforced in the database by the partial unique index
// candidates_active_application_uniq (see drizzle/0020_*.sql). Keep the two
// status lists identical.

export const CLOSED_APPLICATION_STATUSES = [
  'failed',
  'no_show',
  'unresponsive',
  'withdrew',
  'hired',
  'consider_other',
] as const;

export const ACTIVE_APPLICATION_INDEX = 'candidates_active_application_uniq';

export const ALREADY_APPLIED_MESSAGE = "You've already applied for this role — we'll be in touch.";

export const CANDIDATE_ALREADY_EXISTS_MESSAGE =
  'A candidate with this email already has an open application for this position.';

/** lower(btrim(value)), matching the index expression. */
export function normalizeApplicationKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function isClosedApplicationStatus(status: string | null | undefined): boolean {
  // Exact match, like the index's `status NOT IN (...)`.
  return (CLOSED_APPLICATION_STATUSES as readonly string[]).includes(status ?? '');
}

/**
 * Escape LIKE/ILIKE wildcards so user input is matched literally. The value is
 * passed to supabase-js as a filter value (URL-encoded), never spliced into a
 * raw filter string.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, ch => `\\${ch}`);
}

/** PostgREST `in` list for the closed statuses, e.g. (failed,no_show,...). */
export function closedStatusesFilterList(): string {
  return `(${CLOSED_APPLICATION_STATUSES.join(',')})`;
}

type PostgrestLikeError = { code?: string | null; message?: string | null; details?: string | null } | null | undefined;

/** True when an insert failed on the active-application unique index. */
export function isActiveApplicationConflict(error: PostgrestLikeError): boolean {
  if (!error || error.code !== '23505') return false;
  const text = `${error.message ?? ''} ${error.details ?? ''}`;
  // Older deploys without the index cannot raise this, and other unique
  // indexes (e.g. application_code) must not be reported as duplicates.
  return text.includes(ACTIVE_APPLICATION_INDEX);
}

export type ExistingApplicationRow = {
  id: number;
  email: string | null;
  position: string | null;
  status: string | null;
};

/** Pick the first still-open row that matches the email and position exactly. */
export function findActiveDuplicate<T extends ExistingApplicationRow>(
  rows: readonly T[] | null | undefined,
  email: string,
  position: string,
): T | null {
  const e = normalizeApplicationKey(email);
  const p = normalizeApplicationKey(position);
  if (!e || !p) return null;
  for (const row of rows ?? []) {
    if (normalizeApplicationKey(row.email) !== e) continue;
    if (normalizeApplicationKey(row.position) !== p) continue;
    if (isClosedApplicationStatus(row.status)) continue;
    return row;
  }
  return null;
}
