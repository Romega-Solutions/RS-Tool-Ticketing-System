import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/session';

const admin = (overrides: Partial<SessionUser> = {}): SessionUser => ({
  id: 11,
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

function jsonReq(body: unknown) {
  return new Request('http://localhost/api/admin/users', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Minimal 'users' table double for the PATCH handler's before-select /
// update / after-select sequence, plus no-op deletes for the tables the
// deactivate-user project cleanup touches. Any other table (rate_limits,
// audit_log) throws — both callers already treat that as fail-open / best-effort.
function mockUsersTable(afterRow: Record<string, unknown>) {
  let selectCalls = 0;
  const from = vi.fn((table: string) => {
    if (table === 'work_item_assignees' || table === 'project_members') {
      return { delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })) };
    }
    if (table !== 'users') throw new Error(`no mock for table ${table}`);
    return {
      select: vi.fn(() => {
        selectCalls += 1;
        const row = selectCalls === 1 ? { role: 'admin', is_active: 1, tool_access: [] } : afterRow;
        return { eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: row }) })) };
      }),
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    };
  });
  vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({ from })) }));
}

const OTHER_USER_ROW = {
  id: 99, username: 'jane', name: 'Jane', email: 'jane@romega-solutions.com',
  role: 'lead', team: 'Engineering', job_title: null, member_code: null, hourly_rate_usd: null,
  is_active: 0, tool_access: [], date_of_birth: null, start_date: null, end_date: null,
  drive_url: null, approved_hours_per_week: 15, schedule_pht_start: null, schedule_pht_end: null,
  setup_email_sent_at: null,
};

describe('PATCH /api/admin/users — self-edit is role-only', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("lets an admin change their own role", async () => {
    mockSession(admin());
    mockUsersTable({ ...OTHER_USER_ROW, id: 11, username: 'ken', name: 'Ken', email: 'ken@romega-solutions.com', role: 'lead', is_active: 1 });
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

    const { PATCH } = await import('@/app/api/admin/users/route');
    const res = await PATCH(jsonReq({ id: 11, role: 'lead' }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.user.role).toBe('lead');
  });

  it('rejects a self-edit that also touches another field', async () => {
    mockSession(admin());
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

    const { PATCH } = await import('@/app/api/admin/users/route');
    const res = await PATCH(jsonReq({ id: 11, role: 'lead', isActive: 0 }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: expect.stringContaining('only change your own role') });
  });

  it('rejects a self-edit with no role field', async () => {
    mockSession(admin());
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

    const { PATCH } = await import('@/app/api/admin/users/route');
    const res = await PATCH(jsonReq({ id: 11, isActive: 0 }));

    expect(res.status).toBe(403);
  });

  it('still allows an admin to edit every field on someone else', async () => {
    mockSession(admin());
    mockUsersTable(OTHER_USER_ROW);
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

    const { PATCH } = await import('@/app/api/admin/users/route');
    const res = await PATCH(jsonReq({ id: 99, role: 'lead', isActive: 0 }));

    expect(res.status).toBe(200);
  });

  it('deactivating a user removes them from every project (membership + assignments)', async () => {
    mockSession(admin());
    const deletedTables: string[] = [];
    let selectCalls = 0;
    const from = vi.fn((table: string) => {
      if (table === 'work_item_assignees' || table === 'project_members') {
        return { delete: vi.fn(() => ({ eq: vi.fn((col: string, val: number) => {
          deletedTables.push(table);
          expect(col).toBe('user_id');
          expect(val).toBe(99);
          return Promise.resolve({ error: null });
        }) })) };
      }
      if (table !== 'users') throw new Error(`no mock for table ${table}`);
      return {
        select: vi.fn(() => {
          selectCalls += 1;
          const row = selectCalls === 1 ? { role: 'lead', is_active: 1, tool_access: [] } : { ...OTHER_USER_ROW, is_active: 0 };
          return { eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: row }) })) };
        }),
        update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
      };
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({ from })) }));
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

    const { PATCH } = await import('@/app/api/admin/users/route');
    const res = await PATCH(jsonReq({ id: 99, isActive: 0 }));

    expect(res.status).toBe(200);
    expect(deletedTables.sort()).toEqual(['project_members', 'work_item_assignees']);
  });

  it('reactivating a user does not touch project membership tables', async () => {
    mockSession(admin());
    const from = vi.fn((table: string) => {
      if (table === 'work_item_assignees' || table === 'project_members') {
        throw new Error(`should not touch ${table} on reactivate`);
      }
      if (table !== 'users') throw new Error(`no mock for table ${table}`);
      let selectCalls = 0;
      return {
        select: vi.fn(() => {
          selectCalls += 1;
          const row = selectCalls === 1 ? { role: 'lead', is_active: 0, tool_access: [] } : { ...OTHER_USER_ROW, is_active: 1 };
          return { eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: row }) })) };
        }),
        update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
      };
    });
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({ from })) }));
    vi.doMock('next/cache', () => ({ revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }));

    const { PATCH } = await import('@/app/api/admin/users/route');
    const res = await PATCH(jsonReq({ id: 99, isActive: 1 }));

    expect(res.status).toBe(200);
  });
});
