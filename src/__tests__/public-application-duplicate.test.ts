import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
type Filter = { op: string; col: string; val: unknown; extra?: unknown };

const state = vi.hoisted(() => ({
  existing: [] as Row[],
  lookupCalls: [] as Filter[][],
  lookupUsedMaybeSingle: false,
  inserts: [] as Row[],
  insertError: null as null | { code: string; message: string; details?: string },
  historyRows: [] as Row[],
  historyError: false,
  notifyPayloads: [] as Row[],
  communicationEvents: [] as Row[],
  uploads: 0,
  parses: 0,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ ok: true })),
  keyByIp: vi.fn(() => 'k'),
  clientIp: vi.fn(() => '127.0.0.1'),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/session', () => ({ getSession: vi.fn(async () => ({ id: 9, name: 'HR', role: 'admin', toolAccess: [] })) }));
vi.mock('@/lib/rbac', () => ({ hasToolAccess: vi.fn(() => true) }));
vi.mock('@/lib/storage', () => ({
  uploadResumeToStorage: vi.fn(async () => { state.uploads += 1; return { signedUrl: 'https://files.example.test/cv.pdf' }; }),
  uploadCandidatePreEmploymentDocument: vi.fn(),
}));
vi.mock('@/lib/onboarders', () => ({ createOnboarderFromCandidate: vi.fn() }));
vi.mock('@/lib/onboarding-lead', () => ({ getRequiredGlobalOnboardingLead: vi.fn() }));
vi.mock('@/lib/pre-employment-forms', () => ({}));
vi.mock('@/lib/n8n', () => ({
  parseResumeWithN8n: vi.fn(async () => { state.parses += 1; return { success: false }; }),
  notifyCommunicationWebhook: vi.fn(async (event: Row) => {
    state.communicationEvents.push(event);
    return { ok: true, template: 'acknowledgment' };
  }),
  notifyOnboardingWebhook: vi.fn(),
  notifyFormReminder: vi.fn(),
  notifyRecruiterOfApplication: vi.fn(async (payload: Row) => {
    state.notifyPayloads.push(payload);
    return { ok: true };
  }),
}));

function likeToRegex(pattern: string): RegExp {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\') { out += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue; }
    if (ch === '%') { out += '.*'; continue; }
    if (ch === '_') { out += '.'; continue; }
    out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`, 'is');
}

// A small database stand-in that applies the filters the code sends.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async () => ({ data: 'APP-2026-0002', error: null }),
    from: (table: string) => {
      let op = 'select';
      let payload: unknown = null;
      const filters: Filter[] = [];
      const result = (single: boolean) => {
        if (table === 'positions') {
          return { data: { id: 3, job_title: 'Full-Stack Developer', created_by: 7, is_open: true }, error: null };
        }
        if (table === 'candidates' && op === 'insert') {
          if (state.insertError) return { data: null, error: state.insertError };
          state.inserts.push(payload as Row);
          return { data: { id: 77 }, error: null };
        }
        if (table === 'candidates' && op === 'select') {
          if (single) { state.lookupUsedMaybeSingle = true; return { data: null, error: { message: 'multiple rows' } }; }
          state.lookupCalls.push([...filters]);
          let rows = state.existing;
          for (const f of filters) {
            if (f.op === 'ilike') rows = rows.filter(r => likeToRegex(String(f.val)).test(String(r[f.col] ?? '')));
            if (f.op === 'not' && f.extra === 'in') {
              const list = String(f.val).replace(/^\(|\)$/g, '').split(',');
              rows = rows.filter(r => !list.includes(String(r[f.col])));
            }
          }
          return { data: rows, error: null };
        }
        if (table === 'candidate_history' && op === 'insert') {
          if (state.historyError) return { data: null, error: { message: 'history down' } };
          state.historyRows.push(...(payload as Row[]));
          return { data: null, error: null };
        }
        return { data: single ? null : [], error: null };
      };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, val: unknown) => { filters.push({ op: 'eq', col, val }); return builder; },
        gte: () => builder,
        ilike: (col: string, val: unknown) => { filters.push({ op: 'ilike', col, val }); return builder; },
        not: (col: string, extra: unknown, val: unknown) => { filters.push({ op: 'not', col, val, extra }); return builder; },
        order: () => builder,
        limit: () => builder,
        insert: (p: unknown) => { op = 'insert'; payload = p; return builder; },
        update: (p: unknown) => { op = 'update'; payload = p; return builder; },
        maybeSingle: async () => result(true),
        single: async () => result(true),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(result(false)).then(resolve),
      };
      return builder;
    },
  }),
}));

import { createCandidate, createPublicApplication } from '@/app/(app)/recruiting/candidates/actions';
import { POST } from '@/app/api/public/applications/[positionId]/route';
import { NextRequest } from 'next/server';
import {
  ALREADY_APPLIED_MESSAGE,
  CANDIDATE_ALREADY_EXISTS_MESSAGE,
  escapeLikePattern,
  findActiveDuplicate,
} from '@/lib/duplicate-application';

const RACE_ERROR = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "candidates_active_application_uniq"',
  details: 'Key (lower(btrim(email)), lower(btrim("position")))=(jamie@example.com, full-stack developer) already exists.',
};

function pdf() {
  return new File(['%PDF-1.4 test'], 'cv.pdf', { type: 'application/pdf' });
}

const application = (email = 'Jamie@Example.com') => ({
  positionId: 3,
  fullName:   'jamie rivera',
  email,
  phone:      '09171234567',
  linkedinUrl: null,
  message:     null,
  resume:      pdf(),
});

function expectNothingSent() {
  expect(state.inserts).toHaveLength(0);
  expect(state.communicationEvents).toHaveLength(0);
  expect(state.notifyPayloads).toHaveLength(0);
  expect(state.uploads).toBe(0);
  expect(state.parses).toBe(0);
}

beforeEach(() => {
  state.existing = [];
  state.lookupCalls = [];
  state.lookupUsedMaybeSingle = false;
  state.inserts = [];
  state.insertError = null;
  state.historyRows = [];
  state.historyError = false;
  state.notifyPayloads = [];
  state.communicationEvents = [];
  state.uploads = 0;
  state.parses = 0;
  delete process.env.APPLICANT_ACK_MODE;
  delete process.env.RESEND_API_KEY;
});

describe('createPublicApplication duplicate rule', () => {
  it('blocks an active duplicate: no insert, no emails, no parse or upload', async () => {
    state.existing = [{ id: 12, email: 'jamie@example.com', position: 'Full-Stack Developer', status: 'interview_romega', application_code: 'APP-2026-0001', full_name: 'Jamie Rivera' }];
    const result = await createPublicApplication(application());
    expect(result).toEqual({ ok: false, code: 'ALREADY_APPLIED', error: ALREADY_APPLIED_MESSAGE });
    // Nothing about the earlier application leaks out.
    expect(JSON.stringify(result)).not.toMatch(/APP-2026-0001|interview|Jamie|12/);
    expectNothingSent();
  });

  it('allows a new application when the earlier one is closed', async () => {
    for (const status of ['failed', 'no_show', 'unresponsive', 'withdrew', 'hired', 'consider_other']) {
      state.existing = [{ id: 12, email: 'jamie@example.com', position: 'Full-Stack Developer', status }];
      state.inserts = [];
      const result = await createPublicApplication(application());
      expect(result, status).toMatchObject({ ok: true, candidateId: 77 });
      expect(state.inserts, status).toHaveLength(1);
    }
  });

  it('matches the email regardless of case and surrounding spaces', async () => {
    state.existing = [{ id: 12, email: '  JAMIE@example.COM ', position: ' full-stack developer ', status: 'pending_response' }];
    const result = await createPublicApplication(application('  jamie@EXAMPLE.com  '));
    expect(result).toMatchObject({ ok: false, code: 'ALREADY_APPLIED' });
    expectNothingSent();
  });

  it('allows the same email for a different position', async () => {
    state.existing = [{ id: 12, email: 'jamie@example.com', position: 'QA Engineer', status: 'pending_response' }];
    const result = await createPublicApplication(application());
    expect(result).toMatchObject({ ok: true, candidateId: 77 });
    expect(state.inserts).toHaveLength(1);
  });

  it('returns ALREADY_APPLIED when the unique index catches a race (23505)', async () => {
    state.insertError = RACE_ERROR;
    const result = await createPublicApplication(application());
    expect(result).toEqual({ ok: false, code: 'ALREADY_APPLIED', error: ALREADY_APPLIED_MESSAGE });
    expect(state.communicationEvents).toHaveLength(0);
    expect(state.notifyPayloads).toHaveLength(0);
    expect(state.uploads).toBe(0);
  });

  it('keeps DB_ERROR for a 23505 on some other unique index', async () => {
    state.insertError = { code: '23505', message: 'duplicate key value violates unique constraint "candidates_application_code_key"' };
    const result = await createPublicApplication(application());
    expect(result).toMatchObject({ ok: false, code: 'DB_ERROR' });
  });

  it('writes a history entry on the existing candidate with a null user', async () => {
    state.existing = [{ id: 12, email: 'jamie@example.com', position: 'Full-Stack Developer', status: 'pending_response' }];
    await createPublicApplication(application());
    expect(state.historyRows).toHaveLength(1);
    expect(state.historyRows[0]).toMatchObject({
      candidate_id: 12,
      user_id: null,
      summary: 'Duplicate application attempt blocked',
    });
  });

  it('still blocks when the history write fails', async () => {
    state.existing = [{ id: 12, email: 'jamie@example.com', position: 'Full-Stack Developer', status: 'pending_response' }];
    state.historyError = true;
    const result = await createPublicApplication(application());
    expect(result).toMatchObject({ ok: false, code: 'ALREADY_APPLIED' });
    expectNothingSent();
  });

  it('does not throw when there is more than one earlier row', async () => {
    state.existing = [
      { id: 10, email: 'jamie@example.com', position: 'Full-Stack Developer', status: 'failed' },
      { id: 11, email: 'jamie@example.com', position: 'Full-Stack Developer', status: 'pending_response' },
      { id: 12, email: 'jamie@example.com', position: 'Full-Stack Developer', status: 'offered' },
    ];
    const result = await createPublicApplication(application());
    expect(result).toMatchObject({ ok: false, code: 'ALREADY_APPLIED' });
    expect(state.lookupUsedMaybeSingle).toBe(false);
    expect(state.historyRows[0]).toMatchObject({ candidate_id: 11 });
  });

  it('matches wildcard characters in the email literally', async () => {
    state.existing = [{ id: 12, email: 'jamiex@example.com', position: 'Full-Stack Developer', status: 'pending_response' }];
    const result = await createPublicApplication(application('jamie_@example.com'));
    expect(result).toMatchObject({ ok: true, candidateId: 77 });
    const ilikes = state.lookupCalls.flat().filter(f => f.op === 'ilike').map(f => f.val);
    expect(ilikes[0]).toBe('jamie\\_@example.com');
    expect(state.lookupCalls.flat().some(f => f.op === 'not' && f.extra === 'in' && f.col === 'status')).toBe(true);
  });
});

describe('createCandidate (HR) duplicate handling', () => {
  it('returns a clear "already exists" message on the active-application index', async () => {
    state.insertError = RACE_ERROR;
    const fd = new FormData();
    fd.set('fullName', 'Jamie Rivera');
    fd.set('email', 'jamie@example.com');
    fd.set('positionId', '3');
    const result = await createCandidate(fd);
    expect(result).toEqual({ ok: false, code: 'ALREADY_EXISTS', error: CANDIDATE_ALREADY_EXISTS_MESSAGE });
  });
});

describe('duplicate-application helpers', () => {
  it('escapes LIKE wildcards and backslashes', () => {
    expect(escapeLikePattern('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
  });

  it('ignores rows with a missing email or position', () => {
    expect(findActiveDuplicate([{ id: 1, email: null, position: 'Dev', status: 'pending_response' }], 'a@b.c', 'Dev')).toBeNull();
    expect(findActiveDuplicate([{ id: 1, email: 'a@b.c', position: null, status: 'pending_response' }], 'a@b.c', 'Dev')).toBeNull();
  });
});

describe('public applications API', () => {
  function request(extra: Record<string, string> = {}) {
    const fd = new FormData();
    fd.set('fullName', 'jamie rivera');
    fd.set('email', 'jamie@example.com');
    fd.set('phone', '09171234567');
    fd.set('resume', pdf());
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    return new NextRequest('http://localhost/api/public/applications/3', {
      method: 'POST',
      headers: { authorization: 'Bearer test-token' },
      body: fd,
    });
  }
  const ctx = { params: Promise.resolve({ positionId: '3' }) };

  beforeEach(() => { process.env.PUBLIC_APPLICATIONS_TOKEN = 'test-token'; });

  it('returns 409 ALREADY_APPLIED with only the code and message', async () => {
    state.existing = [{ id: 12, email: 'jamie@example.com', position: 'Full-Stack Developer', status: 'pending_response', application_code: 'APP-2026-0001', full_name: 'Jamie Rivera' }];
    const res = await POST(request(), ctx);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, code: 'ALREADY_APPLIED', error: ALREADY_APPLIED_MESSAGE });
  });

  it('keeps the honeypot path as a quiet success', async () => {
    state.existing = [{ id: 12, email: 'jamie@example.com', position: 'Full-Stack Developer', status: 'pending_response' }];
    const res = await POST(request({ company_website: 'spam' }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, candidateId: 0, applicationCode: null });
    expect(state.historyRows).toHaveLength(0);
  });

  it('returns 200 for a first application', async () => {
    const res = await POST(request(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, candidateId: 77 });
  });
});
