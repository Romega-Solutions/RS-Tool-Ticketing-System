import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '@/lib/api';
import {
  fetchAllRows,
  rangeDayCount,
  snapshotCutoff,
  MAX_RANGE_DAYS,
  MAX_ROWS,
  PAGE_SIZE,
  type PageResult,
} from '@/lib/timesheet-paging';
import { rangeReplyError } from '@/lib/export-utils';

type Row = { id: number; at: string };

// Sorted by (at, id) like the real query: id n has time n.
const makeRows = (n: number, startId = 1): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: startId + i, at: String(startId + i).padStart(8, '0') }));

/**
 * Mocked pager standing in for `.select(..., { count: 'exact' }).range(from, to)`.
 * `rows` is read live on every call, so a test can change it between pages.
 * `serverCap` mimics the project's max-rows limit; `cutoff` mimics `.lte('clocked_in_at', cutoff)`.
 */
function mockPager(
  rows: () => Row[],
  opts: { serverCap?: number; cutoff?: string; hook?: (call: number) => void; fail?: (call: number) => boolean } = {},
) {
  let call = 0;
  const fetchPage = vi.fn(async (from: number, to: number): Promise<PageResult<Row>> => {
    call += 1;
    opts.hook?.(call);
    if (opts.fail?.(call)) return { data: null, count: null, error: { code: 'XX000' } };
    const visible = rows().filter(r => opts.cutoff === undefined || r.at <= opts.cutoff);
    const limit = Math.min(to - from + 1, opts.serverCap ?? Infinity);
    return { data: visible.slice(from, from + limit), count: visible.length };
  });
  return fetchPage;
}

describe('fetchAllRows', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { logSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); });

  it.each([0, 1, 999, 1000, 1001, 2000, 2001, 2500])('returns every row for %i rows', async (n) => {
    const all = makeRows(n);
    const fetchPage = mockPager(() => all);
    const out = await fetchAllRows(fetchPage);

    expect(out).toHaveLength(n);
    expect(out.map(r => r.id)).toEqual(all.map(r => r.id));
    expect(fetchPage).toHaveBeenCalledTimes(Math.max(1, Math.ceil(n / PAGE_SIZE)));
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('asks for consecutive 1,000-row windows', async () => {
    const fetchPage = mockPager(() => makeRows(2001));
    await fetchAllRows(fetchPage);
    expect(fetchPage.mock.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('still completes when the server caps a response below the page size', async () => {
    const all = makeRows(1300);
    const out = await fetchAllRows(mockPager(() => all, { serverCap: 500 }));
    expect(out).toHaveLength(1300);
  });

  it('ignores rows that arrive between pages when the query has a fixed cutoff', async () => {
    let rows = makeRows(2001);
    const cutoff = rows[rows.length - 1].at;
    // A new clock-in lands after page 1; it sorts after the cutoff.
    const fetchPage = mockPager(() => rows, {
      cutoff,
      hook: call => { if (call === 2) rows = [...rows, ...makeRows(3, 9000)]; },
    });
    const out = await fetchAllRows(fetchPage);

    expect(out).toHaveLength(2001);
    expect(out.some(r => r.id >= 9000)).toBe(false);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('retries the whole fetch once when the count changes between pages, then succeeds', async () => {
    let rows = makeRows(2001);
    // Without a cutoff, a row landing mid-export changes the count seen by page 2.
    const fetchPage = mockPager(() => rows, { hook: call => { if (call === 2) rows = [...rows, ...makeRows(1, 9000)]; } });
    const out = await fetchAllRows(fetchPage);

    expect(out).toHaveLength(2002);
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects a mid-export edit that shifts rows (duplicate ids), retries, then succeeds', async () => {
    const all = makeRows(1500);
    let call = 0;
    // First attempt: page 2 repeats the last row of page 1 (an earlier row was edited in, so offsets shifted).
    const fetchPage = vi.fn(async (from: number, to: number): Promise<PageResult<Row>> => {
      call += 1;
      if (call === 2) return { data: [all[999], ...all.slice(1000, 1499)], count: 1500 };
      return { data: all.slice(from, to + 1), count: 1500 };
    });
    const out = await fetchAllRows(fetchPage);

    expect(out.map(r => r.id)).toEqual(all.map(r => r.id));
    expect(fetchPage).toHaveBeenCalledTimes(4);
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('throws a 500 and returns nothing when the rows do not match the count on both attempts', async () => {
    const all = makeRows(1500);
    const fetchPage = vi.fn(async (from: number, to: number): Promise<PageResult<Row>> => ({
      data: all.slice(from, Math.min(to + 1, 1499)), // always one short, so the last row is missing
      count: 1500,
    }));

    const err = await fetchAllRows(fetchPage).catch(e => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(500);
    expect(err.message).toBe('Export data was incomplete. Please try again.');
    expect(logSpy).toHaveBeenCalledTimes(2);
  });

  it('treats a missing count as a failure, never as "no more rows"', async () => {
    const fetchPage = vi.fn(async (): Promise<PageResult<Row>> => ({ data: makeRows(10), count: null }));
    const err = await fetchAllRows(fetchPage).catch(e => e);
    expect(err.status).toBe(500);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('retries after a query error on page 1 and succeeds', async () => {
    const all = makeRows(30);
    const out = await fetchAllRows(mockPager(() => all, { fail: call => call === 1 }));
    expect(out).toHaveLength(30);
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('throws a 500 with a fixed message when a query keeps failing on page 2', async () => {
    const all = makeRows(1500);
    const fetchPage = mockPager(() => all, { fail: call => call % 2 === 0 });
    const err = await fetchAllRows(fetchPage).catch(e => e);

    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(500);
    expect(err.message).toBe('Could not load timesheets. Please try again.');
    expect(logSpy).toHaveBeenCalledTimes(2);
  });

  it('treats a thrown request as a failed attempt', async () => {
    const fetchPage = vi.fn(async () => { throw new Error('network down (secret detail)'); });
    const err = await fetchAllRows(fetchPage as never).catch(e => e);
    expect(err.status).toBe(500);
    expect(err.message).not.toContain('secret');
    expect(logSpy.mock.calls.flat().join(' ')).not.toContain('secret');
  });

  it('never logs row values, only counts and error codes', async () => {
    const all = makeRows(5);
    await fetchAllRows(mockPager(() => all, { fail: call => call === 1 }));
    const logged = logSpy.mock.calls.flat().join(' ');
    expect(logged).toContain('XX000');
    expect(logged).not.toMatch(/00000001/);
  });

  describe('row ceiling', () => {
    it('defaults to 20,000 rows and 1,000-row pages', () => {
      expect(MAX_ROWS).toBe(20000);
      expect(PAGE_SIZE).toBe(1000);
    });

    it('allows exactly the ceiling', async () => {
      const out = await fetchAllRows(mockPager(() => makeRows(50)), { pageSize: 10, maxRows: 50 });
      expect(out).toHaveLength(50);
    });

    it('answers 413 one row over the ceiling, after one page and with no retry', async () => {
      const fetchPage = mockPager(() => makeRows(51));
      const err = await fetchAllRows(fetchPage, { pageSize: 10, maxRows: 50 }).catch(e => e);

      expect(err).toBeInstanceOf(HttpError);
      expect(err.status).toBe(413);
      expect(fetchPage).toHaveBeenCalledTimes(1);
      expect(logSpy).not.toHaveBeenCalled();
    });
  });
});

describe('rangeDayCount / MAX_RANGE_DAYS', () => {
  it('counts calendar days inclusively', () => {
    expect(rangeDayCount('2026-07-01', '2026-07-01')).toBe(1);
    expect(rangeDayCount('2026-07-01', '2026-07-07')).toBe(7);
    expect(rangeDayCount('2026-01-01', '2026-12-31')).toBe(365);
    expect(rangeDayCount('2028-01-01', '2028-12-31')).toBe(366); // leap year
  });

  it('is DST- and timezone-independent', () => {
    expect(rangeDayCount('2026-03-01', '2026-04-01')).toBe(32);
    expect(rangeDayCount('2026-10-25', '2026-11-02')).toBe(9);
  });

  it('caps a range at 366 days', () => {
    expect(MAX_RANGE_DAYS).toBe(366);
    expect(rangeDayCount('2028-01-01', '2028-12-31')).toBeLessThanOrEqual(MAX_RANGE_DAYS);
    expect(rangeDayCount('2028-01-01', '2029-01-01')).toBe(367);
  });
});

describe('snapshotCutoff', () => {
  it('is an ISO UTC string, the same shape clock-ins are stored in', () => {
    expect(snapshotCutoff(new Date('2026-10-27T01:02:03.456Z'))).toBe('2026-10-27T01:02:03.456Z');
  });
});

describe('rangeReplyError (client refuses incomplete replies)', () => {
  it('passes a complete reply', () => {
    expect(rangeReplyError({ complete: true })).toBeNull();
  });
  it('refuses a reply that is not marked complete', () => {
    expect(rangeReplyError({})).toMatch(/full range/);
    expect(rangeReplyError({ complete: false })).toMatch(/full range/);
  });
  it('surfaces a server error message first', () => {
    expect(rangeReplyError({ error: 'Nope', complete: true })).toBe('Nope');
  });
});
