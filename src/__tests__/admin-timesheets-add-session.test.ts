import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/session';

const admin = (overrides: Partial<SessionUser> = {}): SessionUser => ({
  id: 1,
  email: 'ken@romega-solutions.com',
  name: 'Ken',
  username: 'ken',
  role: 'admin',
  team: null,
  jobTitle: null,
  isOnboarding: false,
  toolAccess: [],
  ...overrides,
});

function mockSession(session: SessionUser | null) {
  vi.doMock('@/lib/session', () => ({
    getSession: vi.fn().mockResolvedValue(session),
  }));
}

function postReq(body: unknown) {
  return new Request('http://localhost/api/admin/timesheets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Chainable Supabase query-builder double: every filter method returns itself
// so any call sequence works, and it resolves via `then`/`maybeSingle` like the
// real postgrest-js builder does.
function chainable(result: { data: unknown; error?: unknown }) {
  const obj: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'not', 'order']) {
    obj[method] = vi.fn(() => obj);
  }
  obj.maybeSingle = vi.fn(() => Promise.resolve(result));
  obj.insert = vi.fn(() => Promise.resolve({ error: (result as { error?: unknown }).error ?? null }));
  obj.then = (resolve: (v: typeof result) => void) => resolve(result);
  return obj as { then: unknown } & Record<string, ReturnType<typeof vi.fn>>;
}

function mockTimesheetTables({
  attendance,
  timesheets = [],
  users = null,
}: {
  attendance: { data: unknown };
  timesheets?: unknown[];
  users?: unknown;
}) {
  const attendanceChain = chainable(attendance);
  const timesheetsChain = chainable({ data: timesheets });
  const usersChain = chainable({ data: users });
  const from = vi.fn((table: string) => {
    if (table === 'attendance') return attendanceChain;
    if (table === 'timesheets') return timesheetsChain;
    if (table === 'users') return usersChain;
    if (table === 'overtime_requests') return chainable({ data: [] });
    throw new Error(`no mock for table ${table}`);
  });
  vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({ from })) }));
  return { attendanceChain, timesheetsChain, usersChain };
}

describe('POST /api/admin/timesheets (backfill a session)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('rejects a non-admin caller', async () => {
    mockSession(admin({ role: 'lead' }));
    mockTimesheetTables({ attendance: { data: { thursday_status: 'present' } } });

    const { POST } = await import('@/app/api/admin/timesheets/route');
    const res = await POST(postReq({ userId: 5, clockedInAt: '2026-07-16T09:00:00.000Z' }));

    expect(res.status).toBe(403);
  });

  it('rejects when the target day is not tagged Present', async () => {
    mockSession(admin());
    mockTimesheetTables({ attendance: { data: { thursday_status: null } } });

    const { POST } = await import('@/app/api/admin/timesheets/route');
    const res = await POST(postReq({ userId: 5, clockedInAt: '2026-07-16T09:00:00.000Z' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: expect.stringContaining('Present') });
  });

  it('rejects when there is no attendance row at all for that week', async () => {
    mockSession(admin());
    mockTimesheetTables({ attendance: { data: null } });

    const { POST } = await import('@/app/api/admin/timesheets/route');
    const res = await POST(postReq({ userId: 5, clockedInAt: '2026-07-16T09:00:00.000Z' }));

    expect(res.status).toBe(400);
  });

  it('rejects clockedOutAt at or before clockedInAt', async () => {
    mockSession(admin());
    mockTimesheetTables({ attendance: { data: { thursday_status: 'present' } } });

    const { POST } = await import('@/app/api/admin/timesheets/route');
    const res = await POST(postReq({
      userId: 5,
      clockedInAt: '2026-07-16T09:00:00.000Z',
      clockedOutAt: '2026-07-16T08:00:00.000Z',
    }));

    expect(res.status).toBe(400);
  });

  it('creates a session for a day tagged Present, with no clock-out', async () => {
    mockSession(admin());
    const { attendanceChain, timesheetsChain } = mockTimesheetTables({
      attendance: { data: { thursday_status: 'present' } },
    });

    const { POST } = await import('@/app/api/admin/timesheets/route');
    const res = await POST(postReq({ userId: 5, clockedInAt: '2026-07-16T09:00:00.000Z' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    // Checked Thursday's status column specifically, for the correct user/week.
    expect(attendanceChain.eq).toHaveBeenCalledWith('user_id', 5);
    expect(attendanceChain.eq).toHaveBeenCalledWith('week_start', '2026-07-13');
    expect(timesheetsChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 5,
        clocked_in_at: '2026-07-16T09:00:00.000Z',
        clocked_out_at: null,
        date: expect.any(String),
      }),
    );
  });

  it('creates a completed session and computes duration when clock-out is given', async () => {
    mockSession(admin());
    const { timesheetsChain } = mockTimesheetTables({
      attendance: { data: { thursday_status: 'present' } },
    });

    const { POST } = await import('@/app/api/admin/timesheets/route');
    const res = await POST(postReq({
      userId: 5,
      clockedInAt: '2026-07-16T09:00:00.000Z',
      clockedOutAt: '2026-07-16T11:00:00.000Z',
    }));

    expect(res.status).toBe(200);
    expect(timesheetsChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        clocked_out_at: '2026-07-16T11:00:00.000Z',
        duration_seconds: 7200,
      }),
    );
  });
});
