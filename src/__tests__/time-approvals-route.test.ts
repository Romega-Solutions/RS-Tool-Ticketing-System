import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/session';

// Server-side enforcement on POST /api/attendance/edit-requests: the note
// rules and the supervisor/admin/self checks hold even if the UI is bypassed.

const user = (overrides: Partial<SessionUser> = {}): SessionUser => ({
  id: 48, email: 'lead@example.com', name: 'Lead', username: 'lead', role: 'lead',
  team: 'Technical', jobTitle: null, isOnboarding: false, toolAccess: [], ...overrides,
});

function jsonReq(body: unknown) {
  return new Request('http://localhost/api/attendance/edit-requests', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

function mockDb(row: Record<string, unknown> | null) {
  const update = vi.fn();
  const from = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => ({ data: row, error: null }));
    chain.update = update;
    return chain;
  });
  vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({ from })) }));
  return { from, update };
}

const pendingRow = (over: Record<string, unknown> = {}) => ({
  id: 7, user_id: 65, date: '2026-10-09', status: 'pending', stage: 'supervisor', supervisor_id: 48,
  timesheet_id: 1, requested_clock_in: null, requested_clock_out: '2026-10-09T15:17:00.000Z', ...over,
});

async function post(session: SessionUser, body: unknown) {
  vi.doMock('@/lib/session', () => ({ getSession: vi.fn().mockResolvedValue(session) }));
  vi.doMock('@/lib/notifications', () => ({
    notifyTimeEditDecided: vi.fn(), notifyTimeEditForwarded: vi.fn(), notifyTimeEditRequested: vi.fn(),
  }));
  vi.doMock('@/lib/time-edit-emails', async () => ({
    ...(await vi.importActual<typeof import('@/lib/time-edit-emails')>('@/lib/time-edit-emails')),
    sendTimeEditEmail: vi.fn(),
    sendTimeEditEmailAfterResponse: vi.fn(),
  }));
  const { POST } = await import('@/app/api/attendance/edit-requests/route');
  return POST(jsonReq(body));
}

describe('time approval decisions (server-side rules)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('rejects an approval with no note before reading the request', async () => {
    const { from } = mockDb(pendingRow());
    const res = await post(user(), { id: 7, action: 'approve' });
    expect(res.status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects a decline with a blank reason', async () => {
    mockDb(pendingRow());
    const res = await post(user(), { id: 7, action: 'deny', comment: '   ' });
    expect(res.status).toBe(400);
  });

  it('blocks a lead who is not the recorded supervisor', async () => {
    const { update } = mockDb(pendingRow());
    const res = await post(user({ id: 99 }), { id: 7, action: 'approve', comment: 'ok' });
    expect(res.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it('blocks an admin approving their own request', async () => {
    const { update } = mockDb(pendingRow({ user_id: 21, stage: 'admin', supervisor_id: 24 }));
    const res = await post(user({ id: 21, role: 'admin' }), { id: 7, action: 'approve', comment: 'ok' });
    expect(res.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses to reopen a request the supervisor already rejected', async () => {
    const { update } = mockDb(pendingRow({ status: 'denied', stage: 'done' }));
    const res = await post(user({ id: 21, role: 'admin' }), { id: 7, action: 'approve', comment: 'ok' });
    expect(res.status).toBe(409);
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps the supervisor out of the admin step', async () => {
    const { update } = mockDb(pendingRow({ stage: 'admin', supervisor_decision: 'approved' }));
    const res = await post(user(), { id: 7, action: 'approve', comment: 'ok' });
    expect(res.status).toBe(409);
    expect(update).not.toHaveBeenCalled();
  });
});
