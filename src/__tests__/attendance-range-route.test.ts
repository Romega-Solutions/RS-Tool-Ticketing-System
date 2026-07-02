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
function chainable(result: { data: unknown; error?: unknown }) {
  const obj: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'gte', 'lte', 'not']) {
    obj[method] = vi.fn(() => obj);
  }
  obj.then = (resolve: (v: typeof result) => void) => resolve(result);
  return obj as { then: unknown } & Record<string, ReturnType<typeof vi.fn>>;
}

function mockAttendanceTables({ users, timesheets }: { users: unknown[]; timesheets: unknown[] }) {
  const usersChain = chainable({ data: users });
  const timesheetsChain = chainable({ data: timesheets });
  const from = vi.fn((table: string) => {
    if (table === 'users') return usersChain;
    if (table === 'timesheets') return timesheetsChain;
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

  it('scopes users to the caller\'s team for a non-admin lead', async () => {
    mockSession(user({ role: 'lead', team: 'Engineering' }));
    const { usersChain } = mockAttendanceTables({
      users: [{ id: 1, name: 'Jane', email: 'jane@romega-solutions.com', team: 'Engineering', role: 'ic', member_code: 'JD01', hourly_rate_usd: 10 }],
      timesheets: [
        { user_id: 1, date: '2026-07-01', duration_seconds: 3600 },
        { user_id: 1, date: '2026-07-02', duration_seconds: 1800 },
      ],
    });

    const { GET } = await import('@/app/api/attendance/route');
    const res = await GET(getReq('start=2026-07-01&end=2026-07-02'));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(usersChain.eq).toHaveBeenCalledWith('team', 'Engineering');
    expect(data.start).toBe('2026-07-01');
    expect(data.end).toBe('2026-07-02');
    expect(data.users).toEqual([
      { id: 1, name: 'Jane', team: 'Engineering', role: 'ic', memberCode: 'JD01', hourlyRateUsd: 10 },
    ]);
    expect(data.timesheetsByDay).toEqual({
      '1:2026-07-01': 3600,
      '1:2026-07-02': 1800,
    });
  });

  it('does not team-scope users for an admin', async () => {
    mockSession(user({ role: 'admin', team: null }));
    const { usersChain } = mockAttendanceTables({
      users: [{ id: 1, name: 'Jane', email: 'jane@romega-solutions.com', team: 'Engineering', role: 'ic', member_code: null, hourly_rate_usd: null }],
      timesheets: [],
    });

    const { GET } = await import('@/app/api/attendance/route');
    const res = await GET(getReq('start=2026-07-01&end=2026-07-02'));

    expect(res.status).toBe(200);
    expect(usersChain.eq).not.toHaveBeenCalledWith('team', expect.anything());
  });

  it('lets an IC granted the Attendance checkbox see their team\'s roster', async () => {
    mockSession(user({ role: 'ic', team: 'Engineering', toolAccess: ['attendance'] }));
    mockAttendanceTables({
      users: [{ id: 1, name: 'Jane', email: 'jane@romega-solutions.com', team: 'Engineering', role: 'ic', member_code: null, hourly_rate_usd: null }],
      timesheets: [],
    });

    const { GET } = await import('@/app/api/attendance/route');
    const res = await GET(getReq('start=2026-07-01&end=2026-07-02'));

    expect(res.status).toBe(200);
  });

  it('still blocks an IC without the Attendance checkbox', async () => {
    mockSession(user({ role: 'ic', team: 'Engineering', toolAccess: [] }));

    const { GET } = await import('@/app/api/attendance/route');
    const res = await GET(getReq('start=2026-07-01&end=2026-07-02'));

    expect(res.status).toBe(403);
  });
});
