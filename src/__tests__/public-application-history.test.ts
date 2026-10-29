import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  historyRows: [] as Row[],
  candidateUpdates: [] as Row[],
  notifyPayloads: [] as Row[],
  communicationEvents: [] as Row[],
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/session', () => ({ getSession: vi.fn(async () => null) }));
vi.mock('@/lib/rbac', () => ({ hasToolAccess: vi.fn(() => true) }));
vi.mock('@/lib/storage', () => ({
  uploadResumeToStorage: vi.fn(async () => ({ signedUrl: 'https://files.example.test/cv.pdf' })),
  uploadCandidatePreEmploymentDocument: vi.fn(),
}));
vi.mock('@/lib/onboarders', () => ({ createOnboarderFromCandidate: vi.fn() }));
vi.mock('@/lib/onboarding-lead', () => ({ getRequiredGlobalOnboardingLead: vi.fn() }));
vi.mock('@/lib/pre-employment-forms', () => ({}));
vi.mock('@/lib/n8n', () => ({
  parseResumeWithN8n: vi.fn(async () => ({ success: false })),
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

// A tiny stand-in for the database client that records what is written.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async () => ({ data: 'APP-2026-0001', error: null }),
    from: (table: string) => {
      let op = 'select';
      let payload: unknown = null;
      const result = (single: boolean) => {
        if (table === 'positions') {
          return { data: { id: 3, job_title: 'Full-Stack Developer', created_by: 7, is_open: true }, error: null };
        }
        if (table === 'candidates' && op === 'insert') return { data: { id: 55 }, error: null };
        if (table === 'candidates' && op === 'update') {
          state.candidateUpdates.push(payload as Row);
          return { data: null, error: null };
        }
        if (table === 'candidate_history' && op === 'insert') {
          state.historyRows.push(...(payload as Row[]));
          return { data: null, error: null };
        }
        return { data: single ? null : [], error: null };
      };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        gte: () => builder,
        ilike: () => builder,
        not: () => builder,
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

import { createPublicApplication } from '@/app/(app)/recruiting/candidates/actions';

function pdf() {
  return new File(['%PDF-1.4 test'], 'cv.pdf', { type: 'application/pdf' });
}

const application = () => ({
  positionId: 3,
  fullName:   'jamie rivera',
  email:      'Jamie@Example.com',
  phone:      '09171234567',
  linkedinUrl: null,
  message:     null,
  resume:      pdf(),
});

beforeEach(() => {
  state.historyRows.length = 0;
  state.candidateUpdates.length = 0;
  state.notifyPayloads.length = 0;
  state.communicationEvents.length = 0;
  delete process.env.APPLICANT_ACK_MODE;
  delete process.env.RESEND_API_KEY;
  delete process.env.APPLICATION_NOTIFY_TO;
  vi.restoreAllMocks();
});

describe('createPublicApplication history rows', () => {
  it('writes every history row with a null user id (the public session id 0 is not a user)', async () => {
    const result = await createPublicApplication(application());
    expect(result).toMatchObject({ ok: true, candidateId: 55 });
    expect(state.historyRows.length).toBeGreaterThanOrEqual(2);
    for (const row of state.historyRows) {
      expect(row.user_id).toBeNull();
      expect(row.user_name).toBe('Public Application');
    }
    const fields = state.historyRows.map(r => r.field);
    expect(fields).toContain('created');
    expect(fields).toContain('email_sent');
  });

  it('keeps the email_sent row when the HR confirmation is sent through Resend', async () => {
    process.env.APPLICANT_ACK_MODE = 'hr';
    process.env.RESEND_API_KEY = 're_stub_not_a_real_key';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'email_stub_1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await createPublicApplication(application());
      expect(result.ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(state.communicationEvents).toHaveLength(0); // no second email
      const sent = state.historyRows.find(r => r.field === 'email_sent');
      expect(sent).toMatchObject({ user_id: null, new_value: 'acknowledgment' });
      expect(state.candidateUpdates).toContainEqual(expect.objectContaining({ last_email_template: 'acknowledgment' }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('sends the plain acknowledgement and the HR notice by default', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      await createPublicApplication(application());
      expect(fetchMock).not.toHaveBeenCalled();
      expect(state.communicationEvents).toHaveLength(1);
      expect(state.notifyPayloads).toHaveLength(1);
      expect(state.notifyPayloads[0]).toMatchObject({
        recipients: ['hr@romega-solutions.com'],
        recruiterEmail: null,
        recruiterName: null,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
