import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/lib/session';

// End to end through the two routes with a fake database and a fake sender:
// which emails go out for each step, and that a requester never gets two
// decision emails or none, with the new HTML path off and on.

type Q = {
  table: string; op: 'select' | 'insert' | 'update'; cols?: string; payload?: unknown;
  filters: [string, string, unknown][]; single: boolean;
};
type Result = { data: unknown; error: { message: string } | null };

const REQUESTER = { id: 1, name: 'Req Er', email: 'requester@example.test', role: 'ic', is_active: 1 };
const SUPERVISOR = { id: 2, name: 'Super Visor', email: 'supervisor@example.test', role: 'lead', is_active: 1 };
const ADMIN = { id: 3, name: 'Admin Reyes', email: 'admin@example.test', role: 'admin', is_active: 1 };
const USERS = [REQUESTER, SUPERVISOR, ADMIN];

const session = (u: { id: number; name: string; email: string; role: string }): SessionUser => ({
  id: u.id, email: u.email, name: u.name, username: u.name, role: u.role as SessionUser['role'],
  team: 'Technical', jobTitle: null, isOnboarding: false, toolAccess: [],
});

const requestRow = (over: Record<string, unknown> = {}) => ({
  id: 7, user_id: 1, timesheet_id: 11, date: '2026-10-09', status: 'pending', stage: 'supervisor', supervisor_id: 2,
  current_clock_in: '2026-10-09T15:00:00.000Z', current_clock_out: '2026-10-09T18:00:00.000Z',
  requested_clock_in: null, requested_clock_out: '2026-10-09T18:30:00.000Z',
  reason: 'Late clock out.', document_name: null, requested_at: '2026-10-10 01:41:00+00', ...over,
});

function makeDb(opts: { row?: Record<string, unknown>; timesheetUpdateFails?: boolean } = {}) {
  const calls: Q[] = [];
  const handler = (q: Q): Result => {
    const eq = (c: string) => q.filters.find(f => f[1] === c)?.[2];
    if (q.table === 'timesheet_edit_requests') {
      if (q.op === 'select') {
        if (q.cols === '*') return { data: opts.row ?? requestRow(), error: null };
        if (q.cols === 'id') return { data: [], error: null }; // no open request yet
      }
      if (q.op === 'update') return { data: [{ id: 7 }], error: null };
      if (q.op === 'insert') return { data: { id: 7, requested_at: '2026-10-10 01:41:00+00' }, error: null };
    }
    if (q.table === 'users') {
      if (q.cols === 'id, name, role, is_active') return { data: USERS, error: null };
      if (q.cols === 'id, name, email, is_active') {
        const ids = (q.filters.find(f => f[0] === 'in')?.[2] ?? []) as number[];
        return { data: USERS.filter(u => ids.includes(u.id)), error: null };
      }
      if (q.cols === 'email, notification_prefs') {
        const u = USERS.find(x => x.id === eq('id'));
        return { data: u ? { email: u.email, notification_prefs: null } : null, error: null };
      }
    }
    if (q.table === 'timesheets') {
      if (q.op === 'update') return q.payload && opts.timesheetUpdateFails
        ? { data: null, error: { message: 'write failed' } } : { data: null, error: null };
      return { data: { id: 11, user_id: 1, clocked_in_at: '2026-10-09T15:00:00.000Z', clocked_out_at: '2026-10-09T18:00:00.000Z', date: '2026-10-09' }, error: null };
    }
    if (q.table === 'user_reporting') {
      return { data: { user_id: 1, reports_to_user_id: 2, is_hidden: false }, error: null };
    }
    if (q.table === 'notifications') return { data: null, error: null };
    return { data: null, error: null };
  };
  const from = (table: string) => {
    const q: Q = { table, op: 'select', filters: [], single: false };
    const run = async (): Promise<Result> => { calls.push(q); return handler(q); };
    const chain: Record<string, unknown> = {
      select: (cols?: string) => { q.cols = cols; return chain; },
      insert: (p: unknown) => { q.op = 'insert'; q.payload = p; return chain; },
      update: (p: unknown) => { q.op = 'update'; q.payload = p; return chain; },
      eq: (c: string, v: unknown) => { q.filters.push(['eq', c, v]); return chain; },
      is: (c: string, v: unknown) => { q.filters.push(['is', c, v]); return chain; },
      in: (c: string, v: unknown) => { q.filters.push(['in', c, v]); return chain; },
      limit: () => chain,
      maybeSingle: () => { q.single = true; return run(); },
      single: () => { q.single = true; return run(); },
      then: (res: (v: Result) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej),
    };
    return chain;
  };
  return { admin: { from }, calls };
}

type Sent = { url: string; to: string; cc?: string; subject: string; html: string; body: string };
let sent: Sent[];
// Work handed to after(): the real one runs it once the response is out.
let pending: Promise<unknown>[];

async function setup(db: ReturnType<typeof makeDb>, user: typeof REQUESTER) {
  vi.doMock('next/server', async () => ({
    ...(await vi.importActual<typeof import('next/server')>('next/server')),
    after: (fn: () => unknown) => { pending.push(Promise.resolve().then(fn)); },
  }));
  vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => db.admin) }));
  vi.doMock('@/lib/session', () => ({ getSession: vi.fn().mockResolvedValue(session(user)) }));
  vi.doMock('@/lib/overtime-server', () => ({
    weeklySecondsForUser: vi.fn(async () => 0), baseWeeklySecondsForUser: vi.fn(async () => 144000),
  }));
}

const decide = async (body: unknown) => {
  const { POST } = await import('@/app/api/attendance/edit-requests/route');
  const res = await POST(new Request('http://localhost/api/attendance/edit-requests', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));
  await Promise.all(pending);
  return res;
};

const PLAIN = 'https://n8n.test/plain';
const HTML = 'https://n8n.test/html';
const NEW_ON = { N8N_HTML_EMAIL_URL: HTML, TIME_EDIT_EMAILS_MODE: 'send', VERCEL_ENV: 'production' };

const env = (extra: Record<string, string>) => {
  vi.stubEnv('N8N_NOTIFICATION_EMAIL_URL', PLAIN);
  vi.stubEnv('N8N_HTML_EMAIL_URL', '');
  vi.stubEnv('TIME_EDIT_EMAILS_MODE', '');
  vi.stubEnv('VERCEL_ENV', '');
  vi.stubEnv('TIME_EDIT_EMAILS_TEST_TO', '');
  for (const [k, v] of Object.entries(extra)) vi.stubEnv(k, v);
};

const toRequester = (s: Sent[]) => s.filter(x => x.to === REQUESTER.email);
const decisionEmails = (s: Sent[]) => toRequester(s).filter(x => /time correction was (approved|declined)/i.test(x.subject));

beforeEach(() => {
  vi.resetModules();
  sent = [];
  pending = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    sent.push({ url, ...JSON.parse(init.body as string) });
    return new Response('', { status: 200 });
  }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.doUnmock('@/lib/time-edit-emails'); vi.doUnmock('next/server'); });

describe('decision emails: exactly one per decision in both modes', () => {
  const cases: { name: string; actor: typeof REQUESTER; row?: Record<string, unknown>; body: Record<string, unknown>; subject: string; plainBody: RegExp }[] = [
    { name: 'supervisor declines', actor: SUPERVISOR, body: { id: 7, action: 'deny', comment: 'Not on that call.' }, subject: 'Your time correction was declined by your supervisor', plainBody: /declined/ },
    { name: 'admin declines', actor: ADMIN, row: { stage: 'admin', supervisor_id: null }, body: { id: 7, action: 'deny', comment: 'No record.' }, subject: 'Your time correction was declined by an admin', plainBody: /declined/ },
    { name: 'admin approves', actor: ADMIN, row: { stage: 'admin' }, body: { id: 7, action: 'approve', comment: 'Matches.' }, subject: 'Your time correction was approved', plainBody: /applied to your timesheet/ },
  ];

  for (const c of cases) {
    it(`${c.name}: old path only when the new path is not set`, async () => {
      env({});
      await setup(makeDb({ row: requestRow(c.row) }), c.actor);
      expect((await decide(c.body)).status).toBe(200);
      const mine = decisionEmails(sent);
      expect(mine).toHaveLength(1);
      expect(mine[0].url).toBe(PLAIN);
      expect(mine[0].body).toMatch(c.plainBody);
      expect(sent.filter(s => s.url === HTML)).toHaveLength(0);
    });

    for (const [label, extra] of [
      ['mode is log', { N8N_HTML_EMAIL_URL: HTML, VERCEL_ENV: 'production' }],
      ['mode is off', { ...NEW_ON, TIME_EDIT_EMAILS_MODE: 'off' }],
      ['preview with no test address', { ...NEW_ON, VERCEL_ENV: 'preview' }],
    ] as const) {
      it(`${c.name}: still the one plain email when ${label}`, async () => {
        env(extra);
        await setup(makeDb({ row: requestRow(c.row) }), c.actor);
        expect((await decide(c.body)).status).toBe(200);
        const mine = decisionEmails(sent);
        expect(mine).toHaveLength(1);
        expect(mine[0].url).toBe(PLAIN);
        expect(sent.filter(s => s.url === HTML)).toHaveLength(0);
      });
    }

    it(`${c.name}: only the designed email when the new path sends`, async () => {
      env(NEW_ON);
      await setup(makeDb({ row: requestRow(c.row) }), c.actor);
      expect((await decide(c.body)).status).toBe(200);
      const mine = decisionEmails(sent);
      expect(mine).toHaveLength(1);
      expect(mine[0].url).toBe(HTML);
      expect(mine[0].subject).toBe(c.subject);
      expect(mine[0].html).toContain('Poppins');
      expect(sent.filter(s => s.url === PLAIN && s.to === REQUESTER.email)).toHaveLength(0);
    });
  }

  it('copies the recorded supervisor on the designed email and not on an admin-step request without one', async () => {
    env(NEW_ON);
    await setup(makeDb({ row: requestRow({ stage: 'admin' }) }), ADMIN);
    await decide({ id: 7, action: 'approve', comment: 'ok' });
    expect(decisionEmails(sent)[0].cc).toBe(SUPERVISOR.email);

    vi.resetModules(); sent = [];
    await setup(makeDb({ row: requestRow({ stage: 'admin', supervisor_id: null }) }), ADMIN);
    await decide({ id: 7, action: 'approve', comment: 'ok' });
    expect(decisionEmails(sent)[0].cc).toBeUndefined();
  });

  it('in test mode sends only to the test address and never to the plain sender for the requester', async () => {
    env({ ...NEW_ON, VERCEL_ENV: 'preview', TIME_EDIT_EMAILS_TEST_TO: 'qa@example.test' });
    await setup(makeDb({ row: requestRow() }), SUPERVISOR);
    await decide({ id: 7, action: 'deny', comment: 'No.' });
    expect(toRequester(sent)).toHaveLength(0);
    const html = sent.filter(s => s.url === HTML);
    expect(html).toHaveLength(1);
    expect(html[0].to).toBe('qa@example.test');
    expect(html[0].cc).toBeUndefined();
    expect(html[0].subject.startsWith('[TEST] ')).toBe(true);
  });

  it('sends no approval email when the timesheet update fails', async () => {
    env(NEW_ON);
    await setup(makeDb({ row: requestRow({ stage: 'admin' }), timesheetUpdateFails: true }), ADMIN);
    const res = await decide({ id: 7, action: 'approve', comment: 'ok' });
    expect(res.status).toBe(500);
    expect(sent).toHaveLength(0);
  });

  it('sends no email when the decision is refused', async () => {
    env(NEW_ON);
    await setup(makeDb({ row: requestRow({ status: 'denied', stage: 'done' }) }), ADMIN);
    expect((await decide({ id: 7, action: 'approve', comment: 'ok' })).status).toBe(409);
    expect(sent).toHaveLength(0);
  });
});

describe('supervisor approval', () => {
  it('is in-app only today and sends the designed email when the new path sends', async () => {
    env({});
    await setup(makeDb(), SUPERVISOR);
    expect((await decide({ id: 7, action: 'approve', comment: 'Confirmed.' })).status).toBe(200);
    expect(sent).toHaveLength(0);

    vi.resetModules();
    env(NEW_ON);
    await setup(makeDb(), SUPERVISOR);
    expect((await decide({ id: 7, action: 'approve', comment: 'Confirmed.' })).status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(HTML);
    expect(sent[0].to).toBe(REQUESTER.email);
    expect(sent[0].subject).toBe('Your supervisor approved your request');
    expect(sent[0].body).toContain('Supervisor note: "Confirmed."');
  });
});

describe('filing a request', () => {
  const file = async () => {
    const { POST } = await import('@/app/api/presence/time-edit-request/route');
    const form = new FormData();
    form.set('timesheetId', '11');
    form.set('reason', 'Late clock out.');
    form.set('requestedClockOut', '2026-10-09T18:30:00.000Z');
    const res = await POST(new Request('http://localhost/api/presence/time-edit-request', { method: 'POST', body: form }));
    await Promise.all(pending);
    return res;
  };

  it('sends no email today, and the received email when the new path sends', async () => {
    env({});
    await setup(makeDb(), REQUESTER);
    expect((await file()).status).toBe(200);
    expect(sent).toHaveLength(0);

    vi.resetModules();
    env(NEW_ON);
    await setup(makeDb(), REQUESTER);
    expect((await file()).status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(HTML);
    expect(sent[0].to).toBe(REQUESTER.email);
    expect(sent[0].cc).toBe(SUPERVISOR.email);
    expect(sent[0].subject).toBe('We received your time correction request');
    expect(sent[0].html).toContain('Waiting for supervisor approval');
  });

  it('sends nothing in log mode', async () => {
    env({ N8N_HTML_EMAIL_URL: HTML, VERCEL_ENV: 'production' });
    await setup(makeDb(), REQUESTER);
    expect((await file()).status).toBe(200);
    expect(sent).toHaveLength(0);
  });
});

describe('email never delays the response', () => {
  it('returns from the decision route while the webhook never answers', async () => {
    env(NEW_ON);
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    await setup(makeDb({ row: requestRow({ stage: 'admin' }) }), ADMIN);
    const { POST } = await import('@/app/api/attendance/edit-requests/route');
    const started = Date.now();
    const res = await POST(new Request('http://localhost/api/attendance/edit-requests', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 7, action: 'approve', comment: 'ok' }),
    }));
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(1000);
    // The send was handed to after() and is still waiting on the webhook.
    expect(pending).toHaveLength(1);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});
