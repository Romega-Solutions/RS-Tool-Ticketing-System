import { beforeEach, describe, expect, it, vi } from 'vitest';

// Direct (browser -> storage) uploads for the three upload paths: onboarder
// documents, the contractor intake W-8 and candidate pre-employment documents.
// The real storage helpers run against an in-memory stand-in for Supabase
// (database + storage), so no real bucket or database is touched.

type Row = Record<string, unknown>;
type StoredObject = { size: number; mimetype: string };

const MB = 1024 * 1024;

const state = vi.hoisted(() => ({
  session: null as null | Record<string, unknown>,
  tables: {} as Record<string, Row[]>,
  buckets: {} as Record<string, Map<string, { size: number; mimetype: string }>>,
  tokens: new Map<string, string>(),
  removed: [] as string[],
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;${to}` }); }),
}));
vi.mock('@/lib/session', () => ({ getSession: vi.fn(async () => state.session) }));
vi.mock('@/lib/rbac', () => ({ hasToolAccess: vi.fn(() => true), canAccessLeadTool: vi.fn(() => true) }));
vi.mock('@/lib/n8n', () => ({
  notifyOnboardingWebhook: vi.fn(), notifyFormReminder: vi.fn(), notifyCommunicationWebhook: vi.fn(),
  parseResumeWithN8n: vi.fn(), notifyRecruiterOfApplication: vi.fn(),
}));
vi.mock('@/lib/onboarders', () => ({ createOnboarderFromCandidate: vi.fn() }));
vi.mock('@/lib/onboarding-lead', () => ({ getRequiredGlobalOnboardingLead: vi.fn(), resolveOnboardingLead: vi.fn() }));
vi.mock('@/lib/pre-employment-forms', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(() => ({ ok: true })) }));

function bucket(name: string) {
  return (state.buckets[name] ??= new Map<string, StoredObject>());
}

function storageFor(name: string, asBrowser: boolean) {
  const objects = bucket(name);
  return {
    async createSignedUploadUrl(path: string) {
      if (asBrowser) throw new Error('browser client cannot sign uploads');
      const token = `tok-${name}-${path}-${Math.random()}`;
      state.tokens.set(token, `${name}/${path}`);
      return { data: { path, token, signedUrl: `https://storage.test/${name}/${path}?token=${token}` }, error: null };
    },
    async uploadToSignedUrl(path: string, token: string, file: Blob) {
      if (state.tokens.get(token) !== `${name}/${path}`) return { data: null, error: { message: 'invalid token' } };
      state.tokens.delete(token); // one-time
      objects.set(path, { size: file.size, mimetype: file.type });
      return { data: { path }, error: null };
    },
    async list(folder: string, opts: { search?: string }) {
      const data = [...objects.entries()]
        .filter(([p]) => p.slice(0, p.lastIndexOf('/')) === folder)
        .map(([p, o]) => ({ name: p.slice(p.lastIndexOf('/') + 1), metadata: { size: o.size, mimetype: o.mimetype } }))
        .filter(item => !opts?.search || item.name.startsWith(opts.search));
      return { data, error: null };
    },
    async remove(paths: string[]) {
      for (const p of paths) { objects.delete(p); state.removed.push(p); }
      return { data: [], error: null };
    },
    async createSignedUrl(path: string) {
      return { data: { signedUrl: `https://storage.test/signed/${name}/${path}` }, error: null };
    },
  };
}

function table(name: string) {
  return (state.tables[name] ??= []);
}

function queryBuilder(name: string) {
  const filters: Array<[string, unknown]> = [];
  let pendingUpdate: Row | null = null;
  const matches = (row: Row) => filters.every(([k, v]) => row[k] === v);
  const builder: Record<string, unknown> = {
    select: () => builder,
    order: () => builder,
    limit: () => builder,
    eq: (k: string, v: unknown) => { filters.push([k, v]); return builder; },
    maybeSingle: async () => ({ data: table(name).find(matches) ?? null, error: null }),
    insert: (rows: Row | Row[]) => {
      table(name).push(...(Array.isArray(rows) ? rows : [rows]));
      return Promise.resolve({ data: null, error: null });
    },
    upsert: (row: Row) => { table(name).push(row); return Promise.resolve({ data: null, error: null }); },
    update: (payload: Row) => { pendingUpdate = payload; return builder; },
    then: (resolve: (v: unknown) => unknown) => {
      if (pendingUpdate) for (const row of table(name).filter(matches)) Object.assign(row, pendingUpdate);
      return Promise.resolve({ data: null, error: null }).then(resolve);
    },
  };
  return builder;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (name: string) => queryBuilder(name),
    storage: { from: (name: string) => storageFor(name, false) },
  }),
}));

// The browser Supabase client: it can only use a signed upload token.
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ storage: { from: (name: string) => storageFor(name, true) } }),
}));

import { prepareDocumentUpload, recordDocumentUpload } from '@/app/(app)/onboarders/actions';
import { prepareIntakeW8Upload, submitContractorIntake } from '@/app/(app)/my-tasks/onboarding-intake/actions';
import { preparePreEmploymentUpload, recordPreEmploymentUpload } from '@/app/(app)/recruiting/candidates/actions';
import { directUpload } from '@/lib/direct-upload-client';
import { checkUploadFile, MAX_DIRECT_UPLOAD_BYTES } from '@/lib/direct-upload';

const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function fileOf(bytes: number, name = 'scan.pdf', type = PDF): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

/** Put an object straight into the fake bucket, as a client that skipped the checks could. */
async function rogueUpload(ticket: { bucket: string; path: string; token: string }, bytes: number, type = PDF) {
  return storageFor(ticket.bucket, true).uploadToSignedUrl(ticket.path, ticket.token, new Blob([new Uint8Array(bytes)], { type }));
}

beforeEach(() => {
  state.session = { id: 7, name: 'HR Person', email: 'hr@example.test', role: 'admin', toolAccess: [], isOnboarding: true };
  state.tables = {
    onboarders: [{ id: 25, user_id: 7, onboarder_type: 'contractor', status: 'pre_onboarding', onboarding_form_submitted_at: null, created_at: '2026-11-01' }],
    candidates: [{ id: 55, status: 'offered' }],
  };
  state.buckets = {};
  state.tokens.clear();
  state.removed = [];
});

describe('shared file checks', () => {
  it('allows PDF, images and DOCX for onboarder documents, PDF/DOCX for pre-employment', () => {
    expect(checkUploadFile({ name: 'a.pdf', size: 10, type: PDF }, 'onboarder_document').ok).toBe(true);
    expect(checkUploadFile({ name: 'a.JPG', size: 10, type: 'image/jpeg' }, 'onboarder_document').ok).toBe(true);
    expect(checkUploadFile({ name: 'a.docx', size: 10, type: '' }, 'onboarder_document')).toMatchObject({ ok: true, contentType: DOCX });
    expect(checkUploadFile({ name: 'a.png', size: 10, type: 'image/png' }, 'pre_employment_document').ok).toBe(false);
    expect(checkUploadFile({ name: 'a.exe', size: 10, type: 'application/x-msdownload' }, 'onboarder_document').ok).toBe(false);
    expect(checkUploadFile({ name: 'a.pdf', size: 10, type: 'text/html' }, 'onboarder_document').ok).toBe(false);
  });

  it('caps at exactly 25 MB', () => {
    expect(checkUploadFile({ name: 'a.pdf', size: MAX_DIRECT_UPLOAD_BYTES, type: PDF }, 'onboarder_document').ok).toBe(true);
    expect(checkUploadFile({ name: 'a.pdf', size: MAX_DIRECT_UPLOAD_BYTES + 1, type: PDF }, 'onboarder_document').ok).toBe(false);
  });
});

describe('onboarder documents: prepare', () => {
  it('rejects an oversize file before issuing a URL', async () => {
    const res = await prepareDocumentUpload(25, { kind: 'w8', name: 'w8.pdf', size: 26 * MB, type: PDF });
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/limit is 25 MB/) });
    expect(state.tokens.size).toBe(0);
  });
  it('rejects the wrong type', async () => {
    const res = await prepareDocumentUpload(25, { kind: 'w8', name: 'w8.zip', size: MB, type: 'application/zip' });
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/isn't allowed/) });
    expect(state.tokens.size).toBe(0);
  });
  it('rejects a request with no session', async () => {
    state.session = null;
    expect(await prepareDocumentUpload(25, { kind: 'w8', name: 'w8.pdf', size: MB, type: PDF }))
      .toEqual({ ok: false, error: 'Not authenticated' });
  });
  it('rejects an unknown document kind', async () => {
    expect(await prepareDocumentUpload(25, { kind: 'payslip', name: 'w8.pdf', size: MB, type: PDF }))
      .toEqual({ ok: false, error: 'Invalid document kind' });
  });
  it('returns the same slug path the old upload used, and a token', async () => {
    const res = await prepareDocumentUpload(25, { kind: 'w8', label: null, name: 'W-8 Form Alyssa.pdf', size: MB, type: PDF });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.bucket).toBe('onboarder-docs');
    expect(res.data.path).toMatch(/^onboarders\/25\/w8\/w-8-form-alyssa-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(res.data.token).toBeTruthy();
  });
});

describe('onboarder documents: record', () => {
  it('rejects a missing object', async () => {
    const res = await recordDocumentUpload(25, { kind: 'nbi', path: 'onboarders/25/nbi/nbi-2026-11-03.pdf', fileName: 'nbi.pdf', size: MB, type: PDF });
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/not found/) });
    expect(table('onboarder_documents')).toHaveLength(0);
  });
  it('rejects a path not issued for this onboarder and kind', async () => {
    for (const path of ['onboarders/26/nbi/nbi-2026-11-03.pdf', 'onboarders/25/w8/nbi-2026-11-03.pdf', 'onboarders/25/nbi/../../26/x-2026-11-03.pdf', 'candidates/1/cv.pdf']) {
      const res = await recordDocumentUpload(25, { kind: 'nbi', path, fileName: 'x.pdf', size: MB, type: PDF });
      expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/does not belong/) });
    }
  });
  it('deletes an oversize object and records nothing', async () => {
    const prepared = await prepareDocumentUpload(25, { kind: 'nbi', name: 'nbi.pdf', size: MB, type: PDF });
    if (!prepared.ok) throw new Error(prepared.error);
    await rogueUpload(prepared.data, 26 * MB);
    const res = await recordDocumentUpload(25, { kind: 'nbi', path: prepared.data.path, fileName: 'nbi.pdf', size: MB, type: PDF });
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/26\.0 MB\. The limit is 25 MB/) });
    expect(state.removed).toEqual([prepared.data.path]);
    expect(bucket('onboarder-docs').has(prepared.data.path)).toBe(false);
    expect(table('onboarder_documents')).toHaveLength(0);
  });
  it('rejects an object whose size or type does not match', async () => {
    const prepared = await prepareDocumentUpload(25, { kind: 'nbi', name: 'nbi.pdf', size: MB, type: PDF });
    if (!prepared.ok) throw new Error(prepared.error);
    await rogueUpload(prepared.data, 2 * MB);
    expect(await recordDocumentUpload(25, { kind: 'nbi', path: prepared.data.path, fileName: 'nbi.pdf', size: MB, type: PDF }))
      .toMatchObject({ ok: false, error: expect.stringMatching(/does not match/) });
    bucket('onboarder-docs').set(prepared.data.path, { size: MB, mimetype: 'text/html' });
    expect(await recordDocumentUpload(25, { kind: 'nbi', path: prepared.data.path, fileName: 'nbi.pdf', size: MB, type: PDF }))
      .toMatchObject({ ok: false, error: expect.stringMatching(/type does not match/) });
  });
  it('happy path: inserts the row, stamps the W-8 date and writes history', async () => {
    await directUpload({
      file: fileOf(2 * MB, 'W8 scan.pdf'), policy: 'onboarder_document',
      prepare: meta => prepareDocumentUpload(25, { kind: 'w8', label: 'Signed W-8', ...meta }),
      record: receipt => recordDocumentUpload(25, { kind: 'w8', label: 'Signed W-8', ...receipt }),
    });
    expect(table('onboarder_documents')).toEqual([expect.objectContaining({
      onboarder_id: 25, kind: 'w8', label: 'Signed W-8', mime_type: PDF, size_bytes: 2 * MB, uploaded_by: 7,
      storage_path: expect.stringMatching(/^onboarders\/25\/w8\/signed-w-8-\d{4}-\d{2}-\d{2}\.pdf$/),
    })]);
    expect(table('onboarders')[0].w8_uploaded_at).toEqual(expect.any(String));
    expect(table('onboarder_history')).toEqual([expect.objectContaining({
      field: 'document_uploaded', new_value: 'w8', summary: 'Uploaded w8 — Signed W-8 (W8 scan.pdf)',
    })]);
  });
  it('does not stamp the W-8 date for other kinds', async () => {
    await directUpload({
      file: fileOf(MB, 'id.png', 'image/png'), policy: 'onboarder_document',
      prepare: meta => prepareDocumentUpload(25, { kind: 'gov_id', ...meta }),
      record: receipt => recordDocumentUpload(25, { kind: 'gov_id', ...receipt }),
    });
    expect(table('onboarder_documents')).toHaveLength(1);
    expect(table('onboarders')[0].w8_uploaded_at).toBeUndefined();
    expect(table('onboarder_history')).toHaveLength(1);
  });
});

function intakeForm(): FormData {
  const fd = new FormData();
  fd.set('legalName', 'Alyssa Nicole Yorro');
  fd.set('consent', 'on');
  fd.set('wiseHolderName', 'Alyssa Yorro');
  return fd;
}

async function intakeUpload(file: File) {
  const fd = intakeForm();
  return directUpload({
    file, policy: 'onboarder_document',
    prepare: meta => prepareIntakeW8Upload({ legalName: 'Alyssa Nicole Yorro', ...meta }),
    record: async receipt => {
      fd.set('w8Path', receipt.path); fd.set('w8Name', receipt.fileName);
      fd.set('w8Size', String(receipt.size)); fd.set('w8Type', receipt.type);
      return (await submitContractorIntake(fd)) ?? { ok: true };
    },
  });
}

describe('contractor intake W-8', () => {
  it('prepare rejects oversize, wrong type and no session', async () => {
    expect(await prepareIntakeW8Upload({ legalName: 'A', name: 'w8.pdf', size: 26 * MB, type: PDF })).toMatchObject({ ok: false, error: expect.stringMatching(/limit is 25 MB/) });
    expect(await prepareIntakeW8Upload({ legalName: 'A', name: 'w8.txt', size: MB, type: 'text/plain' })).toMatchObject({ ok: false, error: expect.stringMatching(/isn't allowed/) });
    state.session = null;
    expect(await prepareIntakeW8Upload({ legalName: 'A', name: 'w8.pdf', size: MB, type: PDF })).toEqual({ ok: false, error: 'Not authenticated' });
    expect(state.tokens.size).toBe(0);
  });
  it('submit rejects a missing object and an unissued path', async () => {
    const fd = intakeForm();
    fd.set('w8Path', 'onboarders/25/w8/alyssa-nicole-yorro-w-8-2026-11-03.pdf'); fd.set('w8Size', String(MB)); fd.set('w8Type', PDF);
    expect(await submitContractorIntake(fd)).toMatchObject({ ok: false, error: expect.stringMatching(/not found/) });
    fd.set('w8Path', 'onboarders/99/w8/x-2026-11-03.pdf');
    expect(await submitContractorIntake(fd)).toMatchObject({ ok: false, error: expect.stringMatching(/does not belong/) });
    expect(table('onboarder_documents')).toHaveLength(0);
    expect(table('onboarders')[0].onboarding_form_submitted_at).toBeNull();
  });
  it('submit deletes an oversize object', async () => {
    const prepared = await prepareIntakeW8Upload({ legalName: 'Alyssa', name: 'w8.pdf', size: MB, type: PDF });
    if (!prepared.ok) throw new Error(prepared.error);
    await rogueUpload(prepared.data, 26 * MB);
    const fd = intakeForm();
    fd.set('w8Path', prepared.data.path); fd.set('w8Size', String(MB)); fd.set('w8Type', PDF);
    expect(await submitContractorIntake(fd)).toMatchObject({ ok: false, error: expect.stringMatching(/limit is 25 MB/) });
    expect(state.removed).toEqual([prepared.data.path]);
    expect(table('onboarder_documents')).toHaveLength(0);
  });
  it('happy path: records the W-8, stamps the dates, writes history and redirects', async () => {
    await expect(intakeUpload(fileOf(3 * MB, 'my w8.pdf'))).rejects.toMatchObject({ digest: 'NEXT_REDIRECT;/my-tasks?intake=submitted' });
    expect(table('onboarder_documents')).toEqual([expect.objectContaining({
      onboarder_id: 25, kind: 'w8', label: 'W-8 — Alyssa Nicole Yorro', size_bytes: 3 * MB, mime_type: PDF,
      storage_path: expect.stringMatching(/^onboarders\/25\/w8\/alyssa-nicole-yorro-w-8-\d{4}-\d{2}-\d{2}\.pdf$/),
    })]);
    const onb = table('onboarders')[0];
    expect(onb.w8_uploaded_at).toEqual(onb.onboarding_form_submitted_at);
    expect(onb.wise_details_submitted_at).toEqual(onb.onboarding_form_submitted_at);
    expect(table('onboarder_history')).toEqual([expect.objectContaining({ field: 'onboarding_form_submitted' })]);
  });
});

async function preEmploymentUpload(file: File, kind = 'sow') {
  return directUpload({
    file, policy: 'pre_employment_document',
    prepare: meta => preparePreEmploymentUpload(55, kind, meta),
    record: receipt => recordPreEmploymentUpload(55, kind, receipt),
  });
}

describe('pre-employment documents', () => {
  it('prepare rejects oversize, wrong type, no session and a non-offered candidate', async () => {
    expect(await preparePreEmploymentUpload(55, 'sow', { name: 'sow.pdf', size: 26 * MB, type: PDF })).toMatchObject({ ok: false, error: expect.stringMatching(/limit is 25 MB/) });
    expect(await preparePreEmploymentUpload(55, 'sow', { name: 'sow.png', size: MB, type: 'image/png' })).toMatchObject({ ok: false, error: expect.stringMatching(/PDF or DOCX/) });
    table('candidates')[0].status = 'screening';
    expect(await preparePreEmploymentUpload(55, 'sow', { name: 'sow.pdf', size: MB, type: PDF })).toMatchObject({ ok: false, error: expect.stringMatching(/offered/) });
    state.session = null;
    expect(await preparePreEmploymentUpload(55, 'sow', { name: 'sow.pdf', size: MB, type: PDF })).toEqual({ ok: false, error: 'Not authenticated' });
    expect(state.tokens.size).toBe(0);
  });
  it('record rejects a missing object and an unissued path', async () => {
    expect(await recordPreEmploymentUpload(55, 'sow', { path: 'candidates/55/pre-employment/sow/1730000000000-sow.pdf', fileName: 'sow.pdf', size: MB, type: PDF }))
      .toMatchObject({ ok: false, error: expect.stringMatching(/not found/) });
    expect(await recordPreEmploymentUpload(55, 'sow', { path: 'candidates/55/pre-employment/nda/1730000000000-sow.pdf', fileName: 'sow.pdf', size: MB, type: PDF }))
      .toMatchObject({ ok: false, error: expect.stringMatching(/does not belong/) });
    expect(table('candidate_pre_employment_documents')).toHaveLength(0);
  });
  it('record deletes an oversize object', async () => {
    const prepared = await preparePreEmploymentUpload(55, 'nda', { name: 'nda.pdf', size: MB, type: PDF });
    if (!prepared.ok) throw new Error(prepared.error);
    expect(prepared.data.bucket).toBe('candidate-pre-employment-docs');
    await rogueUpload(prepared.data, 26 * MB);
    expect(await recordPreEmploymentUpload(55, 'nda', { path: prepared.data.path, fileName: 'nda.pdf', size: MB, type: PDF }))
      .toMatchObject({ ok: false, error: expect.stringMatching(/limit is 25 MB/) });
    expect(state.removed).toEqual([prepared.data.path]);
    expect(table('candidate_pre_employment_documents')).toHaveLength(0);
  });
  it('happy path: upserts the document with a signed URL and writes history', async () => {
    await preEmploymentUpload(fileOf(MB, 'Job Description.docx', DOCX), 'job_description');
    expect(table('candidate_pre_employment_documents')).toEqual([expect.objectContaining({
      candidate_id: 55, kind: 'job_description', file_name: 'Job Description.docx', mime_type: DOCX, size_bytes: MB,
      signed_url: expect.stringContaining('https://storage.test/signed/candidate-pre-employment-docs/candidates/55/pre-employment/job_description/'),
    })]);
    expect(table('candidate_history')).toEqual([expect.objectContaining({ field: 'pre_employment_document_uploaded', new_value: 'job_description' })]);
  });
});

// The size matrix: about 0.5, 5, 24 and 26 MB through each full browser flow
// (client check -> prepare -> uploadToSignedUrl -> record).
describe.each([
  ['onboarder document', async (f: File) => directUpload({
    file: f, policy: 'onboarder_document',
    prepare: meta => prepareDocumentUpload(25, { kind: 'contract', ...meta }),
    record: receipt => recordDocumentUpload(25, { kind: 'contract', ...receipt }),
  }), () => table('onboarder_documents').length],
  ['intake W-8', async (f: File) => intakeUpload(f).catch((err: { digest?: string }) => {
    if (!String(err?.digest ?? '').startsWith('NEXT_REDIRECT')) throw err;
  }), () => table('onboarder_documents').length],
  ['pre-employment document', (f: File) => preEmploymentUpload(f), () => table('candidate_pre_employment_documents').length],
] as const)('size matrix: %s', (_label, run, recorded) => {
  it.each([
    ['0.5 MB', Math.round(0.5 * MB)],
    ['5 MB', 5 * MB],
    ['24 MB', 24 * MB],
  ])('%s uploads and is recorded', async (_size, bytes) => {
    await run(fileOf(bytes));
    expect(recorded()).toBe(1);
    const stored = [...Object.values(state.buckets).flatMap(b => [...b.values()])];
    expect(stored).toEqual([{ size: bytes, mimetype: PDF }]);
  });
  it('26 MB is stopped in the browser before any upload', async () => {
    await expect(run(fileOf(26 * MB))).rejects.toThrow('File is 26.0 MB. The limit is 25 MB.');
    expect(state.tokens.size).toBe(0);
    expect(Object.values(state.buckets).every(b => b.size === 0)).toBe(true);
    expect(recorded()).toBe(0);
  });
});
