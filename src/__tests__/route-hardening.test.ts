import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/session';

const user = (overrides: Partial<SessionUser> = {}): SessionUser => ({
  id: 11,
  email: 'ken@romega-solutions.com',
  name: 'Ken',
  username: 'ken',
  role: 'ic',
  team: 'Engineering',
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

function jsonReq(method: string, body: unknown) {
  return new Request('http://localhost/api/test', {
    method,
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('route hardening coverage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('tickets project creation rejects a non-string name before calling the ticket service', async () => {
    const createProject = vi.fn();
    mockSession(user());
    vi.doMock('@/lib/tickets', () => ({ createProject }));

    const { POST } = await import('@/app/api/tickets/projects/route');
    const res = await POST(jsonReq('POST', { name: 123 }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: expect.stringContaining('name') });
    expect(createProject).not.toHaveBeenCalled();
  });

  it('project member creation rejects a non-number userId before mutating membership', async () => {
    const addProjectMember = vi.fn();
    // Global admins bypass the project-role check (no DB needed), so the request
    // reaches input validation — which is what this test asserts.
    mockSession(user({ role: 'admin' }));
    vi.doMock('@/lib/tickets', () => ({
      addProjectMember,
      getProjectMembers: vi.fn(),
    }));

    const { POST } = await import('@/app/api/tickets/projects/[projectId]/members/route');
    const res = await POST(
      jsonReq('POST', { userId: 'abc' }),
      { params: Promise.resolve({ projectId: '42' }) },
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: expect.stringContaining('userId') });
    expect(addProjectMember).not.toHaveBeenCalled();
  });

  it('profile update returns a 400 envelope for malformed JSON', async () => {
    mockSession(user());

    const { PUT } = await import('@/app/api/profile/me/route');
    const res = await PUT(jsonReq('PUT', '{bad json'));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON body' });
  });

  it('attendance edit rejects non-string day statuses with a 400 response', async () => {
    mockSession(user({ role: 'admin' }));

    const { POST } = await import('@/app/api/attendance/route');
    const res = await POST(jsonReq('POST', { weekStart: '2026-06-08', monday: 3 }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid status for monday' });
  });

  it('weekly report submission returns a 400 envelope for malformed JSON', async () => {
    mockSession(user());

    const { POST } = await import('@/app/api/weekly-report/route');
    const res = await POST(jsonReq('POST', '{bad json'));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON body' });
  });

  it('attendance writes are blocked for non-admin report users', async () => {
    mockSession(user({ role: 'lead' }));

    const { POST } = await import('@/app/api/attendance/route');
    const res = await POST(jsonReq('POST', { weekStart: '2026-06-08' }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('reports member listing is blocked for IC users before loading members', async () => {
    const getWorkspaceMembers = vi.fn();
    mockSession(user({ role: 'ic' }));
    vi.doMock('@/lib/tickets', () => ({ getWorkspaceMembers }));

    const { GET } = await import('@/app/api/reports/members/route');
    const res = await GET();

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(getWorkspaceMembers).not.toHaveBeenCalled();
  });

  it('report export requires targetMemberId only for report-capable users', async () => {
    mockSession(user({ role: 'lead' }));

    const { POST } = await import('@/app/api/reports/generate/route');
    const res = await POST(jsonReq('POST', {}));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'targetMemberId is required.' });
  });

  it('presence stream preserves its legacy plain-text unauthorized response', async () => {
    mockSession(null);

    const { GET } = await import('@/app/api/presence/stream/route');
    const res = await GET();

    expect(res.status).toBe(401);
    expect(await res.text()).toBe('Unauthorized');
  });

  it('orgchart lookup converts unexpected lookup failures into a 500 envelope', async () => {
    mockSession(user());
    vi.doMock('@/lib/orgchart', () => ({
      lookupPerson: vi.fn().mockRejectedValue(new Error('orgchart down')),
    }));

    const { GET } = await import('@/app/api/orgchart/lookup/route');
    const res = await GET({
      nextUrl: new URL('http://localhost/api/orgchart/lookup?email=ken%40romega-solutions.com'),
    } as never);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal server error' });
  });

  it('weekly report stays available to IC users for their own invalid-week validation path', async () => {
    mockSession(user({ role: 'ic' }));

    const { POST } = await import('@/app/api/weekly-report/route');
    const res = await POST(jsonReq('POST', { weekStart: 'not-a-monday' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'weekStart must be a Monday (YYYY-MM-DD)' });
  });
});
