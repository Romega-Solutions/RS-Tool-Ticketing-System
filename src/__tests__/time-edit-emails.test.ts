import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emailRequestFromRow, resolveRecipients, sendTimeEditEmail, type TimeEditEmailRequest } from '@/lib/time-edit-emails';

type U = { id: number; name: string; email: string | null; is_active: number };

function fakeAdmin(users: U[], error: { message: string } | null = null) {
  const inFn = vi.fn(async (_col: string, ids: number[]) => ({
    data: error ? null : users.filter(u => ids.includes(u.id)),
    error,
  }));
  const select = vi.fn(() => ({ in: inFn }));
  const from = vi.fn(() => ({ select }));
  return { admin: { from } as never, from, inFn };
}

const request = (over: Partial<TimeEditEmailRequest> = {}): TimeEditEmailRequest => ({
  id: 7, userId: 1, date: '2026-10-09',
  currentClockIn: '2026-10-09T15:00:00.000Z', currentClockOut: '2026-10-09T18:00:00.000Z',
  requestedClockIn: null, requestedClockOut: '2026-10-09T18:30:00.000Z',
  reason: 'Late clock out.', documentName: null, requestedAt: '2026-10-10T01:41:00.000Z',
  supervisorId: 2, ...over,
});

const users: U[] = [
  { id: 1, name: 'Req Er', email: 'requester@example.test', is_active: 1 },
  { id: 2, name: 'Super Visor', email: 'supervisor@example.test', is_active: 1 },
];

const sendEnv = () => {
  vi.stubEnv('N8N_HTML_EMAIL_URL', 'https://n8n.test/html');
  vi.stubEnv('TIME_EDIT_EMAILS_MODE', 'send');
  vi.stubEnv('VERCEL_ENV', 'production');
};

let fetchMock: ReturnType<typeof vi.fn>;
const posted = () => JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response('', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('resolveRecipients', () => {
  const req = { id: 1, email: 'r@example.test' };
  const sup = { id: 2, name: 'S', email: 's@example.test', isActive: true };

  it('received / approved / declined_supervisor go To the requester with no CC', () => {
    for (const kind of ['received', 'approved', 'declined_supervisor'] as const) {
      expect(resolveRecipients(kind, req, sup)).toEqual({ to: 'r@example.test', cc: [] });
    }
  });

  it('supervisor_action_needed goes To the supervisor only', () => {
    expect(resolveRecipients('supervisor_action_needed', req, sup)).toEqual({
      to: 's@example.test', cc: [],
    });
  });

  it('supervisor_action_needed has no To when the supervisor is missing, inactive, or has a bad address', () => {
    expect(resolveRecipients('supervisor_action_needed', req, null).to).toBeNull();
    expect(resolveRecipients('supervisor_action_needed', req, { ...sup, isActive: false }).to).toBeNull();
    expect(resolveRecipients('supervisor_action_needed', req, { ...sup, email: null }).to).toBeNull();
    expect(resolveRecipients('supervisor_action_needed', req, { ...sup, email: 'Name <s@example.test>' }).to).toBeNull();
  });

  it('declined_admin CCs an active supervisor and skips bad cases', () => {
    expect(resolveRecipients('declined_admin', req, sup)).toEqual({
      to: 'r@example.test', cc: ['s@example.test'],
    });
    expect(resolveRecipients('declined_admin', req, null).cc).toEqual([]);
    expect(resolveRecipients('declined_admin', req, { ...sup, isActive: false }).cc).toEqual([]);
    expect(resolveRecipients('declined_admin', req, { ...sup, email: null }).cc).toEqual([]);
    expect(resolveRecipients('declined_admin', req, { ...sup, id: 1 }).cc).toEqual([]);
    expect(resolveRecipients('declined_admin', req, { ...sup, email: 'R@example.test' }).cc).toEqual([]);
  });

  it('skips addresses that are not a single plain address', () => {
    expect(resolveRecipients('received', { id: 1, email: 'a@example.test, b@example.test' }, sup)).toEqual({ to: null, cc: [] });
    expect(resolveRecipients('declined_admin', req, { ...sup, email: 's@example.test, x@example.test' }).cc).toEqual([]);
  });

  it('has no recipient when the requester has no address', () => {
    expect(resolveRecipients('received', { id: 1, email: ' ' }, sup)).toEqual({ to: null, cc: [] });
  });
});

describe('emailRequestFromRow', () => {
  it('maps database columns and treats blanks as null', () => {
    expect(emailRequestFromRow({
      id: 7, user_id: 1, date: '2026-10-09', current_clock_in: 'a', current_clock_out: null,
      requested_clock_in: '', requested_clock_out: 'b', reason: 'why', document_name: 'f.png',
      requested_at: 't', supervisor_id: 2,
    })).toEqual({
      id: 7, userId: 1, date: '2026-10-09', currentClockIn: 'a', currentClockOut: null,
      requestedClockIn: null, requestedClockOut: 'b', reason: 'why', documentName: 'f.png',
      requestedAt: 't', supervisorId: 2,
    });
    expect(emailRequestFromRow({ id: 1, user_id: 1, supervisor_id: null }).supervisorId).toBeNull();
  });
});

describe('sendTimeEditEmail', () => {
  it('sends nothing and reads nothing when the HTML webhook is unset', async () => {
    vi.stubEnv('N8N_HTML_EMAIL_URL', '');
    vi.stubEnv('TIME_EDIT_EMAILS_MODE', 'send');
    vi.stubEnv('VERCEL_ENV', 'production');
    const { admin, from } = fakeAdmin(users);
    await sendTimeEditEmail({ kind: 'received', request: request(), admin });
    expect(from).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends nothing in the default log mode, and logs without addresses', async () => {
    vi.stubEnv('N8N_HTML_EMAIL_URL', 'https://n8n.test/html');
    vi.stubEnv('VERCEL_ENV', 'production');
    const { admin } = fakeAdmin(users);
    await sendTimeEditEmail({ kind: 'received', request: request(), admin });
    expect(fetchMock).not.toHaveBeenCalled();
    const logged = JSON.stringify((console.info as unknown as { mock: { calls: unknown[] } }).mock.calls);
    expect(logged).toContain('log only');
    expect(logged).not.toContain('@');
  });

  it('sends nothing when the mode is off', async () => {
    sendEnv();
    vi.stubEnv('TIME_EDIT_EMAILS_MODE', 'off');
    await sendTimeEditEmail({ kind: 'received', request: request(), admin: fakeAdmin(users).admin });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends received To the requester with no CC', async () => {
    sendEnv();
    await sendTimeEditEmail({ kind: 'received', request: request(), waitingFor: 'supervisor', admin: fakeAdmin(users).admin });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('https://n8n.test/html');
    const body = posted();
    expect(body.to).toBe('requester@example.test');
    expect(body.cc).toBeUndefined();
    expect(body.subject).toBe('Your time correction was received');
    expect(body.html).toContain('Waiting for supervisor approval');
    expect(body.html).toContain('Super Visor');
    expect(body.body).not.toContain('Your supervisor is copied.');
  });

  it('sends supervisor_action_needed To the supervisor only', async () => {
    sendEnv();
    await sendTimeEditEmail({
      kind: 'supervisor_action_needed', request: request(), waitingFor: 'supervisor', admin: fakeAdmin(users).admin,
    });
    const body = posted();
    expect(body.to).toBe('supervisor@example.test');
    expect(body.cc).toBeUndefined();
    expect(body.subject).toBe('Time correction waiting on your review');
    expect(body.html).toContain('Open Time Approvals');
  });

  it('sends without CC when no supervisor is recorded on received', async () => {
    sendEnv();
    await sendTimeEditEmail({ kind: 'received', request: request({ supervisorId: null }), waitingFor: 'admin', admin: fakeAdmin(users).admin });
    const body = posted();
    expect(body.cc).toBeUndefined();
    expect(body.html).toContain('Waiting for admin approval');
    expect(body.body).not.toContain('Your supervisor is copied.');
  });

  it('CCs the supervisor only on declined_admin', async () => {
    sendEnv();
    await sendTimeEditEmail({
      kind: 'declined_admin', request: request(), deciderName: 'Admin Reyes', note: 'No record.', admin: fakeAdmin(users).admin,
    });
    const body = posted();
    expect(body.to).toBe('requester@example.test');
    expect(body.cc).toBe('supervisor@example.test');
    expect(body.subject).toBe('Your time correction was declined');
    expect(body.body).toContain('Declined by:     Admin Reyes, admin');
    expect(body.body).toContain('No record.');
    expect(body.body).toContain('Your supervisor is copied.');
  });

  it('does not CC on approved or declined_supervisor', async () => {
    sendEnv();
    await sendTimeEditEmail({
      kind: 'approved', request: request(), deciderName: 'Admin Reyes', note: 'ok', admin: fakeAdmin(users).admin,
    });
    expect(posted().cc).toBeUndefined();
    fetchMock.mockClear();
    await sendTimeEditEmail({
      kind: 'declined_supervisor', request: request(), deciderName: 'Super Visor', note: 'No.', admin: fakeAdmin(users).admin,
    });
    expect(posted().cc).toBeUndefined();
  });

  it('test address: only that address, no CC, a [TEST] subject, never the real recipients', async () => {
    sendEnv();
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('TIME_EDIT_EMAILS_TEST_TO', 'qa@example.test');
    await sendTimeEditEmail({ kind: 'approved', request: request(), admin: fakeAdmin(users).admin });
    const body = posted();
    expect(body.to).toBe('qa@example.test');
    expect(body.cc).toBeUndefined();
    expect(body.subject).toBe('[TEST] Your time correction was approved');
    expect(JSON.stringify(body)).not.toContain('requester@example.test');
    expect(JSON.stringify(body)).not.toContain('supervisor@example.test');
  });

  it('is log-only in a preview with mode send and no test address', async () => {
    sendEnv();
    vi.stubEnv('VERCEL_ENV', 'preview');
    await sendTimeEditEmail({ kind: 'approved', request: request(), admin: fakeAdmin(users).admin });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never throws: unknown requester, no address, database error, sender failure', async () => {
    sendEnv();
    await expect(sendTimeEditEmail({ kind: 'received', request: request({ userId: 99 }), admin: fakeAdmin(users).admin })).resolves.toBeUndefined();
    await expect(sendTimeEditEmail({
      kind: 'received', request: request(), admin: fakeAdmin([{ ...users[0], email: null }, users[1]]).admin,
    })).resolves.toBeUndefined();
    await expect(sendTimeEditEmail({ kind: 'received', request: request(), admin: fakeAdmin(users, { message: 'boom' }).admin })).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    await expect(sendTimeEditEmail({ kind: 'received', request: request(), admin: fakeAdmin(users).admin })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
