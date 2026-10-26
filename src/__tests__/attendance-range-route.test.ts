import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/session';

const user = (overrides: Partial<SessionUser> = {}): SessionUser => ({
  id: 11,
  email: 'ken@romega-solutions.com',
  name: 'Ken',
  username: 'ken',
  role: 'lead',
  team: 'Engineering',
  jobTitle: null,
  isOnboarding: false,
  toolAccess: ['attendance'],
  ...overrides,
});

function mockSession(session: SessionUser | null) {
  vi.doMock('@/lib/session', () => ({
    getSession: vi.fn().mockResolvedValue(session),
  }));
}

function getReq(qs: string) {
  return new Request(`http://localhost/api/attendance?${qs}`);
}

// Chainable Supabase query-builder double: every filter method returns itself
// so any call sequence (.select().eq().eq()...) works, and it resolves via
// `then` like the real postgrest-js builder does when awaited directly.
function chainable(result: { data: unknown; count?: number; error?: unknown }) {
  const obj: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'gte', 'lte', 'not', 'order', 'range']) {
    obj[method] = vi.fn(() => obj);
  }
  obj.then = (resolve: (v: typeof result) => void) => resolve(result);
  return obj as { then: unknown } & Record<string, ReturnType<typeof vi.fn>>;
}

function mockAttendanceTables({ users, timesheets, reporting = [] }: { users: unknown[]; timesheets: unknown[]; reporting?: unknown[] }) {
  const usersChain = chainable({ data: users });
  const timesheetsChain = chainable({ data: timesheets, count: timesheets.length });
  const reportingChain = chainable({ data: reporting });
  const secondaryChain = chainable({ data: [] });
  const from = vi.fn((table: string) => {
    if (table === 'users') return usersChain;
    if (table === 'timesheets') return timesheetsChain;
    if (table === 'user_reporting') return reportingChain;
    if (table === 'user_secondary_leads') return secondaryChain;
    throw new Error(`no mock for table ${table}`);
  });
  vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({ from })) }));
  return { usersChain, timesheetsChain };
}

describe('GET /api/attendance?start=&end= (custom range)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('rejects a request with only start and no end', async () => {
    mockSession(user());
    const { GET } = await import('@/app/api/attendance/route');
    const res = await GET(getReq('start=2026-07-01'));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: expect.stringContaining('start and end') });
  });

  it('rejects an end date before the start date', async () => {
    mockSession(user());
    const { GET } = await import('@/app/api/attendance/route');
    const res = await GET(getReq('start=2026-07-10&end=2026-07-01'));

    expect(res.status).toBe(400);
  });

  it('rejects malformed dates', async () => {
    mockSession(user());
    const { GET } = await import('@/app/api/attendance/route');
    const res = await GET(getReq('start=not-a-date&end=2026-07-10'));

    expect(res.status).toBe(400);
  });

  it('scopes users to the caller\'s reporting chain for a non-admin lead, without rates', async () => {
    mockSession(user({ role: 'lead', team: 'Engineering' }));
    const { usersChain } = mockAttendanceTables({
      users: [
        { id: 11, name: 'Ken', email: 'ken@romega-solutions.com', team: 'Engineering', role: 'lead', is_active: 1, member_code: null },
        { id: 1, name: 'Jane', email: 'jane@romega-solutions.com', team: 'Engineering', role: 'ic', is_active: 1, member_code: 'JD01', hourly_rate_usd: 10 },
      ],
      reporting: [{ user_id: 1, reports_to_user_id: 11, is_hidden: false }],
      timesheets: [
        { id: 1, user_id: 1, date: '2026-07-01', duration_seconds: 3600 },
        { id: 2, user_id: 1, date: '2026-07-02', duration_seconds: 1800 },
      ],
    });

    const { GET } = await import('@/app/api/attendance/route');
    const res = await GET(getReq('start=2026-07-01&end=2026-07-02'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(usersChain.eq).not.toHaveBeenCalledWith('team', expect.anything());
    expect(usersChain.in).toHaveBeenCalledWith('id', [11, 1]);
    expect(usersChain.select).not.toHaveBeenCalledWith(expect.stringContaining('hourly_rate_usd'));
    expect(data.start).toBe('2026-07-01');
    expect(data.end).toBe('2026-07-02');
    // The double ignores filters, so both rows come back; the rate is still stripped.
    expect(data.users).toEqual([
      { id: 11, name: 'Ken', team: 'Engineering', role: 'lead', memberCode: null, hourlyRateUsd: null },
      { id: 1, name: 'Jane', team: 'Engineering', role: 'ic', memberCode: 'JD01', hourlyRateUsd: null },
    ]);
    expect(data.timesheetsByDay).toEqual({
      '1:2026-07-01': 3600,
      '1:2026-07-02': 1800,
    });
  });

  it('does not scope users for an admin and keeps rates', async () => {
    mockSession(user({ role: 'admin', team: null }));
    const { usersChain } = mockAttendanceTables({
      users: [{ id: 1, name: 'Jane', email: 'jane@romega-solutions.com', team: 'Engineering', role: 'ic', member_code: null, hourly_rate_usd: 12.5 }],
      timesheets: [],
    });

    const { GET } = await import('@/app/api/attendance/route');
    const res = await GET(getReq('start=2026-07-01&end=2026-07-02'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(usersChain.eq).not.toHaveBeenCalledWith('team', expect.anything());
    expect(usersChain.in).not.toHaveBeenCalled();
    expect(data.users[0].hourlyRateUsd).toBe(12.5);
  });

  it('lets an IC without the Attendance checkbox in, scoped to themselves', async () => {
    mockSession(user({ role: 'ic', team: 'Engineering', toolAccess: [] }));
    const { usersChain } = mockAttendanceTables({
      users: [{ id: 11, name: 'Ken', email: 'ken@romega-solutions.com', team: 'Engineering', role: 'ic', is_active: 1, member_code: null }],
      timesheets: [],
    });

    const { GET } = await import('@/app/api/attendance/route');
    const res = await GET(getReq('start=2026-07-01&end=2026-07-02'));

    expect(res.status).toBe(200);
    expect(usersChain.in).toHaveBeenCalledWith('id', [11]);
  });

  it('still requires a signed-in user', async () => {
    mockSession(null);

    const { GET } = await import('@/app/api/attendance/route');
    const res = await GET(getReq('start=2026-07-01&end=2026-07-02'));

    expect(res.status).toBe(401);
  });
});
