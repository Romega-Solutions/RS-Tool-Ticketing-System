import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/session';

// Fake data only: no real people, emails or hours.

const user = (overrides: Partial<SessionUser> = {}): SessionUser => ({
  id: 11,
  email: 'lead@example.test',
  name: 'Test Lead',
  username: 'testlead',
  role: 'lead',
  team: 'Test Team',
  jobTitle: null,
  isOnboarding: false,
  toolAccess: ['attendance'],
  ...overrides,
});

function mockSession(session: SessionUser | null) {
  vi.doMock('@/lib/session', () => ({ getSession: vi.fn().mockResolvedValue(session) }));
  vi.doMock('@/lib/storage', () => ({ getUserPhotoResolver: vi.fn().mockResolvedValue(() => null) }));
}

type Result = { data: unknown; count?: number | null; error?: { code: string } | null };

// Chainable stand-in for a Supabase query builder. `.range(from, to)` slices
// `rows` like PostgREST would (honoring `serverCap`), and the filters it saw are
// recorded so tests can check what was asked.
function table(rows: unknown[] | null, opts: { error?: { code: string }; serverCap?: number; paged?: boolean } = {}) {
  const calls: Record<string, unknown[][]> = {};
  let window: [number, number] | null = null;
  const obj: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'gte', 'lte', 'not', 'is', 'order', 'range']) {
    obj[method] = vi.fn((...args: unknown[]) => {
      (calls[method] ??= []).push(args);
      if (method === 'range') window = [args[0] as number, args[1] as number];
      return obj;
    });
  }
  obj.then = (resolve: (v: Result) => void) => {
    if (opts.error) return resolve({ data: null, count: null, error: opts.error });
    const all = rows ?? [];
    if (!opts.paged || !window) return resolve({ data: all, count: all.length, error: null });
    const [from, to] = window;
    const limit = Math.min(to - from + 1, opts.serverCap ?? Infinity);
    return resolve({ data: all.slice(from, from + limit), count: all.length, error: null });
  };
  return Object.assign(obj, { calls }) as { then: unknown; calls: Record<string, unknown[][]> } & Record<string, ReturnType<typeof vi.fn>>;
}

function mockDb(tables: Record<string, ReturnType<typeof table>>) {
  const from = vi.fn((name: string) => tables[name] ?? table([]));
  vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({ from })) }));
  return from;
}

const req = (qs: string) => new Request(`http://localhost/api/attendance?${qs}`);

const sessionsFor = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    user_id: 1,
    date: '2026-07-01',
    clocked_in_at: `2026-07-01T${String(Math.floor(i / 3600) % 24).padStart(2, '0')}:${String(Math.floor(i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z`,
    clocked_out_at: '2026-07-01T23:59:59Z',
    duration_seconds: 60,
  }));

const adminUsers = [
  { id: 1, name: 'Test Person A', email: 'a@example.test', team: 'Test Team', role: 'ic', is_active: 1, member_code: 'TA01', hourly_rate_usd: 10 },
  { id: 2, name: 'Test Person B', email: 'b@example.test', team: 'Test Team', role: 'ic', is_active: 1, member_code: 'TB02', hourly_rate_usd: 12 },
];

describe('GET /api/attendance?start=&end= (paged range export)', () => {
  beforeEach(() => { vi.resetModules(); vi.restoreAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { vi.doUnmock('@/lib/supabase/admin'); });

  it.each([999, 1000, 1001, 2000, 2001])('returns all %i sessions, marked complete', async (n) => {
    mockSession(user({ role: 'admin' }));
    const timesheets = table(sessionsFor(n), { paged: true });
    mockDb({ users: table(adminUsers), timesheets });

    const { GET } = await import('@/app/api/attendance/route');
    const res = await GET(req('start=2026-07-01&end=2026-07-01'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.complete).toBe(true);
    expect(data.rowCount).toBe(n);
    expect(data.sessions).toHaveLength(n);
    expect(data.timesheetsByDay['1:2026-07-01']).toBe(n * 60);
    expect(timesheets.range).toHaveBeenCalledTimes(Math.ceil(n / 1000));
  });

  it('does not leak the row id to the client', async () => {
    mockSession(user({ role: 'admin' }));
    mockDb({ users: table(adminUsers), timesheets: table(sessionsFor(2), { paged: true }) });
    const { GET } = await import('@/app/api/attendance/route');
    const data = await (await GET(req('start=2026-07-01&end=2026-07-01'))).json();
    expect(Object.keys(data.sessions[0]).sort()).toEqual(['clockedInAt', 'clockedOutAt', 'date', 'userId']);
  });

  it('selects and returns no email or role for the people in the range response', async () => {
    mockSession(user({ role: 'admin' }));
    const users = table(adminUsers);
    mockDb({ users, timesheets: table(sessionsFor(1), { paged: true }) });
    const { GET } = await import('@/app/api/attendance/route');
    const data = await (await GET(req('start=2026-07-01&end=2026-07-01'))).json();

    const selected = users.select.mock.calls.map(c => String(c[0])).join(' ');
    expect(selected).not.toMatch(/email|role/);
    expect(Object.keys(data.users[0]).sort()).toEqual(['hourlyRateUsd', 'id', 'memberCode', 'name', 'team']);
    expect(JSON.stringify(data)).not.toMatch(/example\.test/);
  });

  it('does not add the hours of a still-open session to the day totals', async () => {
    mockSession(user({ role: 'admin' }));
    const open = { id: 1, user_id: 1, date: '2026-07-01', clocked_in_at: '2026-07-01T01:00:00Z', clocked_out_at: null, duration_seconds: null };
    const closed = { id: 2, user_id: 1, date: '2026-07-01', clocked_in_at: '2026-07-01T00:00:00Z', clocked_out_at: '2026-07-01T00:30:00Z', duration_seconds: 1800 };
    mockDb({ users: table(adminUsers), timesheets: table([closed, open], { paged: true }) });
    const { GET } = await import('@/app/api/attendance/route');
    const data = await (await GET(req('start=2026-07-01&end=2026-07-01'))).json();

    expect(data.timesheetsByDay['1:2026-07-01']).toBe(1800);
    expect(data.sessions.map((x: { clockedOutAt: string | null }) => x.clockedOutAt)).toEqual(['2026-07-01T00:30:00Z', null]);
  });

  it('asks for exact counts, a stable order and a fixed clock-in cutoff', async () => {
    mockSession(user({ role: 'admin' }));
    const timesheets = table(sessionsFor(3), { paged: true });
    mockDb({ users: table(adminUsers), timesheets });
    const { GET } = await import('@/app/api/attendance/route');
    await GET(req('start=2026-07-01&end=2026-07-01'));

    expect(timesheets.calls.select[0][1]).toEqual({ count: 'exact' });
    expect(String(timesheets.calls.select[0][0])).toContain('id');
    expect(timesheets.calls.order).toEqual([['clocked_in_at'], ['id']]);
    const [col, cutoff] = timesheets.calls.lte.find(c => c[0] === 'clocked_in_at')!;
    expect(col).toBe('clocked_in_at');
    expect(cutoff).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('sends Cache-Control: private, no-store', async () => {
    mockSession(user({ role: 'admin' }));
    mockDb({ users: table(adminUsers), timesheets: table([], { paged: true }) });
    const { GET } = await import('@/app/api/attendance/route');
    const res = await GET(req('start=2026-07-01&end=2026-07-01'));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('answers 500 with a fixed message, and no partial data, when the timesheet query fails', async () => {
    mockSession(user({ role: 'admin' }));
    mockDb({ users: table(adminUsers), timesheets: table(null, { error: { code: 'XX000' } }) });
    const { GET } = await import('@/app/api/attendance/route');
    const res = await GET(req('start=2026-07-01&end=2026-07-01'));
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data).toEqual({ error: 'Could not load timesheets. Please try again.' });
    expect(data.sessions).toBeUndefined();
  });

  it('answers 500 instead of an empty export when the users query fails', async () => {
    mockSession(user({ role: 'admin' }));
    mockDb({ users: table(null, { error: { code: 'XX000' } }), timesheets: table([]) });
    const { GET } = await import('@/app/api/attendance/route');
    const res = await GET(req('start=2026-07-01&end=2026-07-01'));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Could not load attendance data. Please try again.');
  });

  it('answers 413 when the range holds more than 20,000 rows, after loading one page', async () => {
    mockSession(user({ role: 'admin' }));
    const timesheets = table(sessionsFor(20001), { paged: true });
    mockDb({ users: table(adminUsers), timesheets });
    const { GET } = await import('@/app/api/attendance/route');
    const res = await GET(req('start=2026-07-01&end=2026-07-01'));

    expect(res.status).toBe(413);
    expect((await res.json()).error).toMatch(/too many records/);
    expect(timesheets.range).toHaveBeenCalledTimes(1);
  });

  it('accepts exactly 20,000 rows', async () => {
    mockSession(user({ role: 'admin' }));
    mockDb({ users: table(adminUsers), timesheets: table(sessionsFor(20000), { paged: true }) });
    const { GET } = await import('@/app/api/attendance/route');
    const res = await GET(req('start=2026-07-01&end=2026-07-01'));
    expect(res.status).toBe(200);
    expect((await res.json()).rowCount).toBe(20000);
  });

  describe('range cap', () => {
    it('accepts exactly 366 days', async () => {
      mockSession(user({ role: 'admin' }));
      mockDb({ users: table(adminUsers), timesheets: table([], { paged: true }) });
      const { GET } = await import('@/app/api/attendance/route');
      expect((await GET(req('start=2028-01-01&end=2028-12-31'))).status).toBe(200);
    });

    it('rejects 367 days with a 400 before touching the database', async () => {
      mockSession(user({ role: 'admin' }));
      const from = mockDb({ users: table(adminUsers), timesheets: table([], { paged: true }) });
      const { GET } = await import('@/app/api/attendance/route');
      const res = await GET(req('start=2028-01-01&end=2029-01-01'));

      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/366 days or fewer/);
      expect(from).not.toHaveBeenCalled();
    });

    it('rejects an absurdly long range quickly', async () => {
      mockSession(user({ role: 'admin' }));
      mockDb({ users: table(adminUsers), timesheets: table([]) });
      const { GET } = await import('@/app/api/attendance/route');
      expect((await GET(req('start=0001-01-01&end=9999-12-31'))).status).toBe(400);
    });
  });

  describe('role gating is unchanged', () => {
    it('a non-admin lead is scoped to their chain, gets no rate column, and still gets every page', async () => {
      mockSession(user({ id: 11, role: 'lead' }));
      const users = table([
        { id: 11, name: 'Test Lead', team: 'Test Team', role: 'lead', is_active: 1, member_code: null },
        { id: 1, name: 'Test Person A', team: 'Test Team', role: 'ic', is_active: 1, member_code: 'TA01', hourly_rate_usd: 10 },
      ]);
      const reporting = table([{ user_id: 1, reports_to_user_id: 11, is_hidden: false }]);
      const timesheets = table(sessionsFor(1500), { paged: true });
      mockDb({ users, user_reporting: reporting, user_secondary_leads: table([]), timesheets });

      const { GET } = await import('@/app/api/attendance/route');
      const res = await GET(req('start=2026-07-01&end=2026-07-01'));
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(users.in).toHaveBeenCalledWith('id', [11, 1]);
      expect(users.select.mock.calls.flat().join(' ')).not.toContain('hourly_rate_usd');
      expect(data.users.every((u: { hourlyRateUsd: unknown }) => u.hourlyRateUsd === null)).toBe(true);
      expect(data.sessions).toHaveLength(1500);
      expect(timesheets.in).toHaveBeenCalledWith('user_id', [11, 1]);
    });

    it('an admin still gets all users and their rates', async () => {
      mockSession(user({ role: 'admin' }));
      const users = table(adminUsers);
      mockDb({ users, timesheets: table([], { paged: true }) });
      const { GET } = await import('@/app/api/attendance/route');
      const data = await (await GET(req('start=2026-07-01&end=2026-07-01'))).json();

      expect(users.in).not.toHaveBeenCalled();
      expect(data.users.map((u: { hourlyRateUsd: number }) => u.hourlyRateUsd)).toEqual([10, 12]);
    });

    it('still requires a signed-in user', async () => {
      mockSession(null);
      mockDb({});
      const { GET } = await import('@/app/api/attendance/route');
      expect((await GET(req('start=2026-07-01&end=2026-07-01'))).status).toBe(401);
    });
  });
});

describe('GET /api/attendance?month= (paged month summary)', () => {
  beforeEach(() => { vi.resetModules(); vi.restoreAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { vi.doUnmock('@/lib/supabase/admin'); });

  const monthRows = (n: number, userId = 1) =>
    Array.from({ length: n }, (_, i) => ({ id: i + 1, user_id: userId, duration_seconds: 60 }));

  it.each([999, 1000, 1001, 2001])('sums the hours of all %i sessions', async (n) => {
    mockSession(user({ role: 'admin' }));
    const timesheets = table(monthRows(n), { paged: true });
    mockDb({ users: table(adminUsers), attendance: table([]), timesheets });

    const { GET } = await import('@/app/api/attendance/route');
    const res = await GET(req('month=2026-07'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.summary.find((r: { userId: number }) => r.userId === 1).totalSeconds).toBe(n * 60);
    expect(timesheets.range).toHaveBeenCalledTimes(Math.ceil(n / 1000));
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('answers 500 rather than under-counting hours when the timesheet query fails', async () => {
    mockSession(user({ role: 'admin' }));
    mockDb({ users: table(adminUsers), attendance: table([]), timesheets: table(null, { error: { code: 'XX000' } }) });
    const { GET } = await import('@/app/api/attendance/route');
    const res = await GET(req('month=2026-07'));

    expect(res.status).toBe(500);
    expect((await res.json()).summary).toBeUndefined();
  });

  it('answers 500 when the attendance query fails', async () => {
    mockSession(user({ role: 'admin' }));
    mockDb({ users: table(adminUsers), attendance: table(null, { error: { code: 'XX000' } }), timesheets: table([], { paged: true }) });
    const { GET } = await import('@/app/api/attendance/route');
    expect((await GET(req('month=2026-07'))).status).toBe(500);
  });
});

describe('GET /api/attendance?week= (query errors are not ignored)', () => {
  beforeEach(() => { vi.resetModules(); vi.restoreAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { vi.doUnmock('@/lib/supabase/admin'); });

  it('returns the week with no-store when every query succeeds', async () => {
    mockSession(user({ role: 'admin' }));
    mockDb({ users: table(adminUsers), attendance: table([]), timesheets: table([]), overtime_requests: table([]) });
    const { GET } = await import('@/app/api/attendance/route');
    const res = await GET(req('week=2026-07-06'));

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('answers 500 when a timesheet query fails', async () => {
    mockSession(user({ role: 'admin' }));
    mockDb({ users: table(adminUsers), attendance: table([]), timesheets: table(null, { error: { code: 'XX000' } }), overtime_requests: table([]) });
    const { GET } = await import('@/app/api/attendance/route');
    const res = await GET(req('week=2026-07-06'));

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Could not load attendance data. Please try again.');
  });
});
