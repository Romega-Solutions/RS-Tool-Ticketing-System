import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/session';

const ADMIN: SessionUser = {
  id: 1, email: 'admin@x.com', name: 'Admin', username: 'admin', role: 'admin',
  team: null, jobTitle: null, isOnboarding: false, toolAccess: [],
};

type Chain = Record<string, ReturnType<typeof vi.fn>> & { then: unknown };

// Chainable postgrest double: filters are recorded, not applied.
function chainable(result: { data: unknown; error?: unknown }): Chain {
  const obj: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'not', 'is', 'or', 'order', 'limit', 'neq', 'maybeSingle', 'upsert', 'delete', 'insert']) {
    obj[m] = vi.fn(() => obj);
  }
  obj.then = (resolve: (v: typeof result) => void) => resolve(result);
  return obj as Chain;
}

function mockDb(tables: Record<string, { data: unknown; error?: unknown }>) {
  const chains: Record<string, Chain> = {};
  const from = vi.fn((table: string) => {
    if (!tables[table]) throw new Error(`no mock for table ${table}`);
    chains[table] ??= chainable(tables[table]);
    return chains[table];
  });
  vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({ from })) }));
  return chains;
}

function mockCommon() {
  vi.doMock('@/lib/session', () => ({ getSession: vi.fn().mockResolvedValue(ADMIN) }));
  vi.doMock('@/lib/rate-limit', () => ({ enforceRateLimit: vi.fn(), keyByUser: vi.fn(() => 'k') }));
  const recordAudit = vi.fn();
  vi.doMock('@/lib/audit', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/audit')>()), recordAudit }));
  return recordAudit;
}

describe('reporting line + photo routes write activity log entries', () => {
  beforeEach(() => { vi.resetModules(); vi.restoreAllMocks(); });

  async function setup() {
    const recordAudit = mockCommon();
    vi.doMock('@/lib/storage', () => ({ uploadUserPhoto: vi.fn().mockResolvedValue('users/9/p.png'), userPhotoUrl: vi.fn(() => 'https://cdn/p.png') }));
    vi.doMock('@/lib/reporting-tree-server', () => ({ loadReportingGraph: vi.fn().mockResolvedValue({}) }));
    vi.doMock('@/lib/reporting-tree', () => ({ findReportingLoop: vi.fn(() => null) }));
    mockDb({
      user_reporting: { data: { reports_to_user_id: 2, is_hidden: false } },
      user_secondary_leads: { data: [{ also_reports_to_user_id: 3 }] },
    });
    const mod = await import('@/app/api/admin/users/[id]/reporting/route');
    return { ...mod, recordAudit };
  }

  const put = (body: unknown) => new Request('http://localhost/api/admin/users/9/reporting', {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const ctx = { params: Promise.resolve({ id: '9' }) };

  it('logs user.reporting_changed with the main lead and "also reports to" before/after', async () => {
    const { PUT, recordAudit } = await setup();
    const res = await PUT(put({ reportsToUserId: 5, alsoReportsToUserIds: [3, 4] }), ctx);
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith({
      actorId: 1, action: 'user.reporting_changed', targetUserId: 9,
      details: { changes: { reportsTo: { from: 2, to: 5 }, alsoReportsTo: { from: [3], to: [3, 4] } } },
    });
  });

  it('logs nothing when the reporting line is unchanged', async () => {
    const { PUT, recordAudit } = await setup();
    const res = await PUT(put({ reportsToUserId: 2, alsoReportsToUserIds: [3] }), ctx);
    expect(res.status).toBe(200);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('logs user.photo_changed without the image path or URL', async () => {
    const { POST, recordAudit } = await setup();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const form = new FormData();
    form.append('photo', new File([png], 'p.png', { type: 'image/png' }));
    const res = await POST(new Request('http://localhost/api/admin/users/9/reporting', { method: 'POST', body: form }), ctx);
    expect(res.status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith({ actorId: 1, action: 'user.photo_changed', targetUserId: 9 });
  });
});

describe('GET /api/admin/activity — audit entries', () => {
  beforeEach(() => { vi.resetModules(); vi.restoreAllMocks(); });

  async function setup() {
    mockCommon();
    const chains = mockDb({
      users: { data: [
        { id: 1, name: 'Admin', role: 'admin', team: null },
        { id: 9, name: 'Jane Cruz', role: 'ic', team: 'Eng' },
      ] },
      work_item_activity: { data: [] },
      weekly_reports: { data: [] },
      timesheets: { data: [] },
      attendance: { data: [] },
      presence_pings: { data: [] },
      audit_log: { data: [
        { id: 7, actor_id: 1, action: 'user.updated', target_user_id: 9, created_at: '2026-10-19T16:55:03Z',
          details: { changes: { hourlyRateUsd: { from: 5, to: 7.25 }, dateOfBirth: { from: '1999-03-04', to: '1999-04-03' }, team: { from: 'Eng', to: 'Ops' } } } },
        { id: 8, actor_id: 1, action: 'user.identity_changed', target_user_id: 9, created_at: '2026-10-19T16:50:00Z',
          details: { email: { from: 'jane@gmail.com', to: 'jane@romega-solutions.com' } } },
      ] },
    });
    const { GET } = await import('@/app/api/admin/activity/route');
    return { GET, chains };
  }

  it('filters one person by actor OR target (what they did and what was done to them)', async () => {
    const { GET, chains } = await setup();
    const res = await GET(new Request('http://localhost/api/admin/activity?userId=9'));
    expect(res.status).toBe(200);
    expect(chains.audit_log.or).toHaveBeenCalledWith('actor_id.eq.9,target_user_id.eq.9');
    expect(chains.audit_log.eq).not.toHaveBeenCalledWith('actor_id', 9);
  });

  it('sends field changes and the target user, but never private values or raw details', async () => {
    const { GET } = await setup();
    const res = await GET(new Request('http://localhost/api/admin/activity'));
    const body = await res.json() as { activities: Record<string, unknown>[] };
    const entry = body.activities.find(a => a.id === 'audit-7')!;
    expect(entry).toMatchObject({ userName: 'Admin', targetUserId: 9, targetUserName: 'Jane Cruz' });
    expect(entry.changes).toEqual([
      { field: 'hourlyRateUsd', label: 'Hourly rate', from: null, to: null, hidden: 'private' },
      { field: 'dateOfBirth', label: 'Birth date', from: null, to: null, hidden: 'private' },
      { field: 'team', label: 'Team', from: 'Eng', to: 'Ops' },
    ]);
    expect(entry).not.toHaveProperty('details');
    const raw = JSON.stringify(body);
    for (const secret of ['7.25', '1999-03-04', '1999-04-03', 'jane@gmail.com', 'jane@romega-solutions.com']) {
      expect(raw).not.toContain(secret);
    }
  });
});
