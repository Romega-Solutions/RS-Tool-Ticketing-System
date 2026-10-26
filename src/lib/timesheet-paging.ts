import { HttpError } from '@/lib/api';

// Supabase (PostgREST) silently caps one response at the project's max-rows
// setting (1,000 by default): no error, just fewer rows. Anything that sums or
// lists timesheets over a long range must therefore page, and must prove it got
// every row, or a payroll export quietly under-reports hours.

/** Rows requested per page. */
export const PAGE_SIZE = 1000;
/** Refuse to load more than this many rows for one export. */
export const MAX_ROWS = 20000;
/** Longest date range (inclusive days) one export may cover. */
export const MAX_RANGE_DAYS = 366;

const INCOMPLETE_MESSAGE = 'Export data was incomplete. Please try again.';
const LOAD_FAILED_MESSAGE = 'Could not load timesheets. Please try again.';
const TOO_MANY_MESSAGE = 'This range has too many records to export at once. Please choose a shorter range.';

export interface PageResult<T> {
  data: T[] | null;
  count: number | null;
  error?: { code?: string } | null;
}

export interface PagingOptions {
  pageSize?: number;
  maxRows?: number;
  /** Total attempts, including the first. Default 2 (one retry of the whole fetch). */
  attempts?: number;
}

/** An attempt that cannot be trusted; retried, then reported as a 500. */
class AttemptFailed extends Error {
  constructor(public reason: 'query-error' | 'inconsistent', public detail: string) {
    super(detail);
  }
}

async function attempt<T extends { id: number }>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize: number,
  maxRows: number,
): Promise<T[]> {
  const rows: T[] = [];
  let total: number | null = null;

  for (;;) {
    const from = rows.length;
    let res: PageResult<T>;
    try {
      res = await fetchPage(from, from + pageSize - 1);
    } catch {
      throw new AttemptFailed('query-error', `request failed from=${from}`);
    }
    if (res.error) throw new AttemptFailed('query-error', `code=${res.error.code ?? 'unknown'} from=${from}`);
    if (res.count == null) throw new AttemptFailed('inconsistent', `no count from=${from}`);

    if (total === null) {
      // The exact count of the first page fixes how many rows this export has.
      total = res.count;
      if (total > maxRows) throw new HttpError(413, TOO_MANY_MESSAGE);
    } else if (res.count !== total) {
      throw new AttemptFailed('inconsistent', `count changed ${total}->${res.count} from=${from}`);
    }

    const page = res.data ?? [];
    rows.push(...page);
    // Stop on the exact count (not on a "short page", which is wrong if the
    // server's own cap is below pageSize), or on an empty page.
    if (rows.length >= total || page.length === 0) break;
  }

  if (rows.length !== total) {
    throw new AttemptFailed('inconsistent', `got ${rows.length} of ${total}`);
  }
  if (new Set(rows.map(r => r.id)).size !== rows.length) {
    throw new AttemptFailed('inconsistent', `duplicate ids among ${rows.length}`);
  }
  return rows;
}

/**
 * Loads every row of a query, page by page.
 *
 * `fetchPage` must build the query with `{ count: 'exact' }`, a stable order that
 * ends in `id`, and a fixed upper bound (see `snapshotCutoff`) so rows that land
 * mid-export cannot shift later pages. The first page's exact count is the
 * expected total. If the rows collected don't match it, an id repeats, the count
 * changes between pages, or a query fails, the whole fetch is retried once; after
 * that it throws a 500. It never returns a partial result.
 *
 * Only fixed text, counts and Supabase error codes are logged, never row values.
 */
export async function fetchAllRows<T extends { id: number }>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  options: PagingOptions = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const maxRows = options.maxRows ?? MAX_ROWS;
  const attempts = options.attempts ?? 2;

  let last: AttemptFailed | null = null;
  for (let n = 1; n <= attempts; n++) {
    try {
      return await attempt(fetchPage, pageSize, maxRows);
    } catch (err) {
      if (!(err instanceof AttemptFailed)) throw err;
      last = err;
      console.error(`[attendance] timesheet paging attempt ${n}/${attempts} failed: ${err.reason} (${err.detail})`);
    }
  }
  throw new HttpError(500, last?.reason === 'query-error' ? LOAD_FAILED_MESSAGE : INCOMPLETE_MESSAGE);
}

/**
 * Upper bound for `clocked_in_at` captured before the first page. Sessions that
 * clock in while an export runs get a later timestamp and fall outside it, so
 * they cannot push rows across page boundaries. (Valid because clock-in times are
 * stored as same-format ISO UTC strings, where text order equals time order.)
 */
export function snapshotCutoff(now: Date = new Date()): string {
  return now.toISOString();
}

/** Inclusive number of calendar days from `start` to `end` (both YYYY-MM-DD, already validated). */
export function rangeDayCount(start: string, end: string): number {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000) + 1;
}
