import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/session';

// Org used throughout (ids):
//   1 Robbie (founder)
//   2 Lead            → reports to 1
//   3 Team member     → reports to 2
//   4 Intern          → reports to 3
//   5 Other lead      → no reporting row (founder by default)
//   6 Other member    → reports to 5, hidden
const ORG_USERS = [
  { id: 1, name: 'Robbie Galoso', email: 'r@x.com', team: 'Management', role: 'founder', is_active: 1, member_code: null, hourly_rate_usd: 50, approved_hours_per_week: 40 },
  { id: 2, name: 'Lead', email: 'l@x.com', team: 'Technical', role: 'lead', is_active: 1, member_code: 'L1', hourly_rate_usd: 20, approved_hours_per_week: 40 },
  { id: 3, name: 'Member', email: 'm@x.com', team: 'Sales', role: 'ic', is_active: 1, member_code: 'M1', hourly_rate_usd: 10, approved_hours_per_week: 20 },
  { id: 4, name: 'Intern', email: 'i@x.com', team: 'Sales', role: 'intern', is_active: 1, member_code: 'I1', hourly_rate_usd: 5, approved_hours_per_week: 15 },
  { id: 5, name: 'Other Lead', email: 'o@x.com', team: 'Technical', role: 'lead', is_active: 1, member_code: null, hourly_rate_usd: 25, approved_hours_per_week: 40 },
  { id: 6, name: 'Hidden', email: 'h@x.com', team: 'Technical', role: 'ic', is_active: 1, member_code: null, hourly_rate_usd: 8, approved_hours_per_week: 15 },
];
const ORG_REPORTING = [
  { user_id: 2, reports_to_user_id: 1, is_hidden: false },
  { user_id: 3, reports_to_user_id: 2, is_hidden: false },
  { user_id: 4, reports_to_user_id: 3, is_hidden: false },
  { user_id: 6, reports_to_user_id: 5, is_hidden: true },
];

const session = (id: number, role: SessionUser['role'], overrides: Partial<SessionUser> = {}): SessionUser => ({
  id, email: `${id}@x.com`, name: `User ${id}`, username: `u${id}`, role,
  team: 'Technical', jobTitle: null, isOnboarding: false, toolAccess: [], ...overrides,
});

function mockSession(s: SessionUser | null) {
  vi.doMock('@/lib/session', () => ({ getSession: vi.fn().mockResolvedValue(s) }));
}

type Chain = Record<string, ReturnType<typeof vi.fn>> & { then: unknown };

// Chainable postgrest double. Filters are recorded, not applied — tests assert
// on the filter calls (what the database would have been asked for).
function chainable(result: { data: unknown; count?: number; error?: unknown }): Chain {
  const obj: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'gte', 'lte', 'not', 'is', 'order', 'range', 'neq', 'maybeSingle', 'upsert', 'delete', 'insert']) {
    obj[m] = vi.fn(() => obj);
  }
  obj.then = (resolve: (v: typeof result) => void) => resolve(result);
  return obj as Chain;
}

function mockDb(tables: Record<string, { data: unknown; count?: number; error?: unknown }>) {
  const chains: Record<string, Chain> = {};
  const from = vi.fn((table: string) => {
    if (!tables[table]) throw new Error(`no mock for table ${table}`);
    chains[table] ??= chainable(tables[table]);
    return chains[table];
  });
  vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({ from })) }));
  return { chains, from };
}

function orgTables(extra: Record<string, { data: unknown; count?: number; error?: unknown }> = {}) {
  return {
    users: { data: ORG_USERS },
    user_reporting: { data: ORG_REPORTING },
    user_secondary_leads: { data: [] },
    attendance: { data: [] },
    timesheets: { data: [], count: 0 },
    overtime_requests: { data: [] },
    ...extra,
  };
}

function mockPhotos() {
  vi.doMock('@/lib/storage', () => ({ getUserPhotoResolver: vi.fn().mockResolvedValue(() => null) }));
}

const WEEK = 'week=2026-10-12';

describe('GET /api/attendance — reporting-chain scoping', () => {
  beforeEach(() => { vi.resetModules(); vi.restoreAllMocks(); });

  it('a lead gets self + everyone below them, and the week records are filtered to them', async () => {
    mockSession(session(2, 'lead'));
    mockPhotos();
    const { chains } = mockDb(orgTables());
    const { GET } = await import('@/app/api/attendance/route');
    const res = await GET(new Request(`http://localhost/api/attendance?${WEEK}`));

    expect(res.status).toBe(200);
    expect(chains.users.in).toHaveBeenCalledWith('id', [2, 3, 4]);
    // The former leak: attendance rows must be limited to visible users.
    expect(chains.attendance.in).toHaveBeenCalledWith('user_id', [2, 3, 4]);
    expect(chains.users.eq).not.toHaveBeenCalledWith('team', expect.anything());
  });

  it('a team member sees self + their intern only', async () => {
    mockSession(session(3, 'ic'));
    mockPhotos();
    const { chains } = mockDb(orgTables());
    const { GET } = await import('@/app/api/attendance/route');
    await GET(new Request(`http://localhost/api/attendance?${WEEK}`));

    expect(chains.users.in).toHaveBeenCalledWith('id', [3, 4]);
    expect(chains.attendance.in).toHaveBeenCalledWith('user_id', [3, 4]);
  });

  it('an intern sees only themselves', async () => {
    mockSession(session(4, 'intern'));
    mockPhotos();
    const { chains } = mockDb(orgTables());
    const { GET } = await import('@/app/api/attendance/route');
    await GET(new Request(`http://localhost/api/attendance?${WEEK}`));

    expect(chains.users.in).toHaveBeenCalledWith('id', [4]);
    expect(chains.attendance.in).toHaveBeenCalledWith('user_id', [4]);
  });

  it('hidden users are left out for their lead', async () => {
    mockSession(session(5, 'lead'));
    mockPhotos();
    const { chains } = mockDb(orgTables());
    const { GET } = await import('@/app/api/attendance/route');
    await GET(new Request(`http://localhost/api/attendance?${WEEK}`));

    expect(chains.users.in).toHaveBeenCalledWith('id', [5]);
  });

  it('an admin (including the founder) is not scoped and does not need the tree', async () => {
    mockSession(session(1, 'admin'));
    mockPhotos();
    const { chains, from } = mockDb(orgTables());
    const { GET } = await import('@/app/api/attendance/route');
    const res = await GET(new Request(`http://localhost/api/attendance?${WEEK}`));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(chains.users.in).not.toHaveBeenCalledWith('id', expect.anything());
    expect(chains.attendance.in).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalledWith('user_reporting');
    expect(data.users.find((x: { id: number }) => x.id === 3).hourlyRateUsd).toBe(10);
  });

  it('when an admin views as a lead, they see that lead\'s chain', async () => {
    mockSession(session(2, 'lead', { impersonatedBy: 1 }));
    mockPhotos();
    const { chains } = mockDb(orgTables());
    const { GET } = await import('@/app/api/attendance/route');
    await GET(new Request(`http://localhost/api/attendance?${WEEK}`));

    expect(chains.users.in).toHaveBeenCalledWith('id', [2, 3, 4]);
  });

  it('fails closed when the reporting tree cannot be read', async () => {
    mockSession(session(2, 'lead'));
    mockPhotos();
    mockDb(orgTables({ user_reporting: { data: null, error: { message: 'boom' } } }));
    const { GET } = await import('@/app/api/attendance/route');
    const res = await GET(new Request(`http://localhost/api/attendance?${WEEK}`));

    expect(res.status).toBe(500);
  });
});

describe('GET /api/attendance — hourly rates are admin-only', () => {
  beforeEach(() => { vi.resetModules(); vi.restoreAllMocks(); });

  for (const mode of [WEEK, 'month=2026-10', 'start=2026-10-01&end=2026-10-07']) {
    it(`strips rates for a non-admin (${mode.split('=')[0]})`, async () => {
      mockSession(session(2, 'lead'));
      mockPhotos();
      const { chains } = mockDb(orgTables());
      const { GET } = await import('@/app/api/attendance/route');
      const res = await GET(new Request(`http://localhost/api/attendance?${mode}`));
      const data = await res.json();
      const rows = (data.users ?? data.summary) as { hourlyRateUsd: number | null }[];

      expect(res.status).toBe(200);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every(row => row.hourlyRateUsd === null)).toBe(true);
      const selects = chains.users.select.mock.calls.map(c => String(c[0]));
      expect(selects.some(sel => sel.includes('hourly_rate_usd'))).toBe(false);
    });

    it(`keeps rates for an admin (${mode.split('=')[0]})`, async () => {
      mockSession(session(1, 'admin'));
      mockPhotos();
      mockDb(orgTables());
      const { GET } = await import('@/app/api/attendance/route');
      const res = await GET(new Request(`http://localhost/api/attendance?${mode}`));
      const data = await res.json();
      const rows = (data.users ?? data.summary) as { hourlyRateUsd: number | null }[];

      expect(rows.some(row => row.hourlyRateUsd === 20)).toBe(true);
    });
  }
});

describe('GET /api/admin/timesheets — reporting-chain check', () => {
  beforeEach(() => { vi.resetModules(); vi.restoreAllMocks(); });

  // Points the route's single-user lookup (users…maybeSingle) at one row; the
  // same users chain still serves the reporting-tree read as a list.
  async function withTarget(target: (typeof ORG_USERS)[number]) {
    const { from } = mockDb(orgTables());
    (from('users') as unknown as Chain).maybeSingle.mockImplementationOnce(() => Promise.resolve({ data: target }));
    return (await import('@/app/api/admin/timesheets/route')).GET;
  }

  it('lets a lead read sessions for someone below them', async () => {
    mockSession(session(2, 'lead'));
    const GET = await withTarget(ORG_USERS[3]);
    const res = await GET(new Request('http://localhost/api/admin/timesheets?userId=4&week=2026-10-12'));

    expect(res.status).toBe(200);
  });

  it('blocks a lead from someone outside their chain, even on the same team', async () => {
    mockSession(session(2, 'lead', { team: 'Technical' }));
    const GET = await withTarget(ORG_USERS[4]);
    const res = await GET(new Request('http://localhost/api/admin/timesheets?userId=5&week=2026-10-12'));

    expect(res.status).toBe(403);
  });

  it('blocks a team member from their own manager', async () => {
    mockSession(session(3, 'ic'));
    const GET = await withTarget(ORG_USERS[1]);
    const res = await GET(new Request('http://localhost/api/admin/timesheets?userId=2&week=2026-10-12'));

    expect(res.status).toBe(403);
  });

  it('lets an admin read anyone', async () => {
    mockSession(session(1, 'admin'));
    const GET = await withTarget(ORG_USERS[5]);
    const res = await GET(new Request('http://localhost/api/admin/timesheets?userId=6&week=2026-10-12'));

    expect(res.status).toBe(200);
  });
});

describe('PUT /api/admin/users/[id]/reporting — loop guard', () => {
  beforeEach(() => { vi.resetModules(); vi.restoreAllMocks(); });

  function put(userId: number, body: unknown) {
    return new Request(`http://localhost/api/admin/users/${userId}/reporting`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
  }

  async function setup() {
    mockSession(session(1, 'admin'));
    vi.doMock('@/lib/rate-limit', () => ({ enforceRateLimit: vi.fn(), keyByUser: vi.fn(() => 'k') }));
    vi.doMock('@/lib/storage', () => ({ uploadUserPhoto: vi.fn(), userPhotoUrl: vi.fn() }));
    const db = mockDb(orgTables());
    const { PUT } = await import('@/app/api/admin/users/[id]/reporting/route');
    return { PUT, ...db };
  }

  it('rejects making a lead report to someone below them', async () => {
    const { PUT, chains } = await setup();
    const res = await PUT(put(2, { reportsToUserId: 4, alsoReportsToUserIds: [] }), { params: Promise.resolve({ id: '2' }) });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: expect.stringContaining('reporting loop') });
    expect(chains.user_reporting.upsert).not.toHaveBeenCalled();
    expect(chains.user_secondary_leads.delete).not.toHaveBeenCalled();
  });

  it('rejects a loop through an "also reports to" lead', async () => {
    const { PUT, chains } = await setup();
    const res = await PUT(put(2, { reportsToUserId: 1, alsoReportsToUserIds: [3] }), { params: Promise.resolve({ id: '2' }) });

    expect(res.status).toBe(400);
    expect(chains.user_reporting.upsert).not.toHaveBeenCalled();
  });

  it('saves a valid change', async () => {
    const { PUT, chains } = await setup();
    const res = await PUT(put(4, { reportsToUserId: 5, alsoReportsToUserIds: [2] }), { params: Promise.resolve({ id: '4' }) });

    expect(res.status).toBe(200);
    expect(chains.user_reporting.upsert).toHaveBeenCalled();
  });
});
