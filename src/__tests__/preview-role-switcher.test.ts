import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PREVIEW_ROLES,
  PREVIEW_ROLE_EMAILS,
  PRODUCTION_SUPABASE_REF,
  isAllowedPreviewEmail,
  isPreviewRoleSwitcherEnabled,
  mentionsProductionProject,
  previewEmailForRole,
  previewRoleForEmail,
  previewRoleSwitcherStatus,
} from '@/lib/preview-role-switcher';

const PREVIEW_URL = 'https://cgstmdpbzjuwwoudfeqk.supabase.co';

function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature`;
}

const goodEnv = {
  VERCEL_ENV: 'preview',
  PREVIEW_ROLE_SWITCHER: 'true',
  NEXT_PUBLIC_SUPABASE_URL: PREVIEW_URL,
  SUPABASE_SECRET_KEY: 'sb_secret_preview_only',
};

describe('previewRoleSwitcherStatus guards', () => {
  it('is enabled only when every guard passes', () => {
    expect(previewRoleSwitcherStatus(goodEnv)).toEqual({ enabled: true });
    expect(isPreviewRoleSwitcherEnabled(goodEnv)).toBe(true);
  });

  it.each([
    ['production', 'production'],
    ['development', 'development'],
    ['missing', undefined],
    ['wrong case', 'Preview'],
  ])('is disabled when VERCEL_ENV is %s', (_label, value) => {
    expect(isPreviewRoleSwitcherEnabled({ ...goodEnv, VERCEL_ENV: value })).toBe(false);
  });

  it.each([undefined, '', 'false', '1', 'TRUE', 'yes'])('is disabled when PREVIEW_ROLE_SWITCHER is %s', (value) => {
    expect(isPreviewRoleSwitcherEnabled({ ...goodEnv, PREVIEW_ROLE_SWITCHER: value })).toBe(false);
  });

  it('ignores a NEXT_PUBLIC_ version of the flag', () => {
    const env = { ...goodEnv, PREVIEW_ROLE_SWITCHER: undefined, NEXT_PUBLIC_PREVIEW_ROLE_SWITCHER: 'true' };
    expect(isPreviewRoleSwitcherEnabled(env)).toBe(false);
  });

  it('refuses the production Supabase project URL', () => {
    const env = { ...goodEnv, NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co` };
    expect(previewRoleSwitcherStatus(env)).toEqual({ enabled: false, reason: 'Supabase URL points at production' });
  });

  it('refuses the production ref anywhere in the URL, any case', () => {
    const env = { ...goodEnv, NEXT_PUBLIC_SUPABASE_URL: `https://proxy.example.com/${PRODUCTION_SUPABASE_REF.toUpperCase()}` };
    expect(isPreviewRoleSwitcherEnabled(env)).toBe(false);
  });

  it('refuses a missing or invalid Supabase URL', () => {
    expect(isPreviewRoleSwitcherEnabled({ ...goodEnv, NEXT_PUBLIC_SUPABASE_URL: undefined })).toBe(false);
    expect(isPreviewRoleSwitcherEnabled({ ...goodEnv, NEXT_PUBLIC_SUPABASE_URL: 'not a url' })).toBe(false);
  });

  it('refuses a missing secret key', () => {
    expect(isPreviewRoleSwitcherEnabled({ ...goodEnv, SUPABASE_SECRET_KEY: undefined })).toBe(false);
  });

  it('refuses a legacy secret key issued for the production project', () => {
    const env = { ...goodEnv, SUPABASE_SECRET_KEY: jwt({ ref: PRODUCTION_SUPABASE_REF, role: 'service_role' }) };
    expect(isPreviewRoleSwitcherEnabled(env)).toBe(false);
  });

  it('accepts a legacy secret key for a non-production project', () => {
    const env = { ...goodEnv, SUPABASE_SECRET_KEY: jwt({ ref: 'cgstmdpbzjuwwoudfeqk', role: 'service_role' }) };
    expect(isPreviewRoleSwitcherEnabled(env)).toBe(true);
  });

  it('fails closed if reading the env throws', () => {
    const env = new Proxy({}, { get() { throw new Error('boom'); } }) as Record<string, string>;
    expect(previewRoleSwitcherStatus(env)).toEqual({ enabled: false, reason: 'guard check failed' });
  });
});

describe('preview test accounts', () => {
  it('has exactly the five roles, each on @preview.invalid', () => {
    expect([...PREVIEW_ROLES]).toEqual(['founder', 'admin', 'lead', 'ic', 'intern']);
    for (const role of PREVIEW_ROLES) {
      expect(PREVIEW_ROLE_EMAILS[role]).toBe(`${role}@preview.invalid`);
    }
  });

  it('maps known roles to emails and rejects anything else', () => {
    expect(previewEmailForRole('lead')).toBe('lead@preview.invalid');
    for (const bad of ['', 'owner', 'ADMIN', 'admin ', null, undefined, 1, {}, '__proto__', 'toString']) {
      expect(previewEmailForRole(bad)).toBeNull();
    }
  });

  it('only allows the five known emails', () => {
    expect(isAllowedPreviewEmail('ic@preview.invalid')).toBe(true);
    expect(isAllowedPreviewEmail(' IC@Preview.Invalid ')).toBe(true);
    expect(isAllowedPreviewEmail('someone@preview.invalid')).toBe(false);
    expect(isAllowedPreviewEmail('admin@romega-solutions.com')).toBe(false);
    expect(isAllowedPreviewEmail('admin@preview.invalid.evil.com')).toBe(false);
    expect(isAllowedPreviewEmail(undefined)).toBe(false);
  });

  it('labels the current role from the signed-in email', () => {
    expect(previewRoleForEmail('intern@preview.invalid')).toBe('intern');
    expect(previewRoleForEmail('real.person@romega-solutions.com')).toBeNull();
  });

  it('detects production refs in URLs and JWT keys', () => {
    expect(mentionsProductionProject(`https://${PRODUCTION_SUPABASE_REF}.supabase.co`)).toBe(true);
    expect(mentionsProductionProject(jwt({ ref: PRODUCTION_SUPABASE_REF }))).toBe(true);
    expect(mentionsProductionProject(PREVIEW_URL)).toBe(false);
    expect(mentionsProductionProject(undefined)).toBe(false);
  });
});

// ── Route ──────────────────────────────────────────────────────────────────

type MockOpts = {
  userRow?: { id: number; email: string; is_active: number } | null;
  linkEmail?: string;
  verifyEmail?: string;
};

function mockSupabase(opts: MockOpts = {}) {
  const generateLink = vi.fn().mockResolvedValue({
    data: { properties: { hashed_token: 'hash' }, user: { email: opts.linkEmail ?? 'lead@preview.invalid' } },
    error: null,
  });
  const maybeSingle = vi.fn().mockResolvedValue({
    data: opts.userRow === undefined ? { id: 5, email: 'lead@preview.invalid', is_active: 1 } : opts.userRow,
  });
  const from = vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) }));
  vi.doMock('@/lib/supabase/admin', () => ({
    createAdminClient: vi.fn(() => ({ from, auth: { admin: { generateLink } } })),
  }));
  const verifyOtp = vi.fn().mockImplementation(async () => ({
    data: { user: { email: opts.verifyEmail ?? 'lead@preview.invalid' } },
    error: null,
  }));
  vi.doMock('@supabase/ssr', () => ({ createServerClient: vi.fn(() => ({ auth: { verifyOtp } })) }));
  return { generateLink, verifyOtp, from };
}

async function post(body: Record<string, string>, headers: Record<string, string> = { origin: 'https://preview.example.com' }) {
  const { NextRequest } = await import('next/server');
  const { POST } = await import('@/app/api/preview/switch-role/route');
  const form = new URLSearchParams(body);
  return POST(new NextRequest('https://preview.example.com/api/preview/switch-role', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: form.toString(),
  }));
}

function setEnv(env: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) vi.stubEnv(k, '');
    else vi.stubEnv(k, v);
  }
}

describe('POST /api/preview/switch-role', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock('@/lib/supabase/admin');
    vi.doUnmock('@supabase/ssr');
  });

  it('signs in as the role account and redirects to the dashboard', async () => {
    setEnv({ ...goodEnv, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'pk' });
    const { generateLink, verifyOtp } = mockSupabase();
    const res = await post({ role: 'lead' });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://preview.example.com/dashboard');
    expect(generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'lead@preview.invalid' });
    expect(verifyOtp).toHaveBeenCalledWith({ type: 'magiclink', token_hash: 'hash' });
  });

  it.each([
    ['not a preview', { VERCEL_ENV: 'production' }],
    ['flag off', { PREVIEW_ROLE_SWITCHER: 'false' }],
    ['production database', { NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co` }],
  ])('404s and touches nothing when %s', async (_label, override) => {
    setEnv({ ...goodEnv, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'pk', ...override });
    const { generateLink, from } = mockSupabase();
    const res = await post({ role: 'admin' });
    expect(res.status).toBe(404);
    expect(from).not.toHaveBeenCalled();
    expect(generateLink).not.toHaveBeenCalled();
  });

  it('404s for an unknown role', async () => {
    setEnv({ ...goodEnv, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'pk' });
    const { generateLink } = mockSupabase();
    expect((await post({ role: 'owner' })).status).toBe(404);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it('404s for a cross-site or origin-less post', async () => {
    setEnv({ ...goodEnv, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'pk' });
    const { generateLink } = mockSupabase();
    expect((await post({ role: 'admin' }, { origin: 'https://evil.example.com' })).status).toBe(404);
    expect((await post({ role: 'admin' }, {})).status).toBe(404);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it('404s when the seeded account does not exist, so no auth user is created', async () => {
    setEnv({ ...goodEnv, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'pk' });
    const { generateLink } = mockSupabase({ userRow: null });
    expect((await post({ role: 'lead' })).status).toBe(404);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it('404s if the verified session is not the expected account', async () => {
    setEnv({ ...goodEnv, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'pk' });
    mockSupabase({ verifyEmail: 'someone@romega-solutions.com' });
    expect((await post({ role: 'lead' })).status).toBe(404);
  });

  it('404s on GET', async () => {
    const { GET } = await import('@/app/api/preview/switch-role/route');
    expect((await GET()).status).toBe(404);
  });
});
