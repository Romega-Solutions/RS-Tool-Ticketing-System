import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { OrgAuthProfile } from '@/lib/orgchart';

function mockOAuthUser(email: string, metadata: Record<string, unknown> = {}) {
  vi.doMock('@supabase/ssr', () => ({
    createServerClient: vi.fn(() => ({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          data: { session: { user: { email, user_metadata: metadata } } },
          error: null,
        }),
      },
    })),
  }));
}

function mockOrgAuthProfile(profile: OrgAuthProfile | null) {
  vi.doMock('@/lib/orgchart', async importOriginal => ({
    ...await importOriginal<typeof import('@/lib/orgchart')>(),
    lookupOrgAuthProfileByEmail: vi.fn().mockResolvedValue(profile),
    lookupPerson: vi.fn().mockResolvedValue(null),
  }));
}

function mockUsersTable(existing: { id: number; team: string | null; role?: string } | null = null) {
  const maybeSingle = vi.fn()
    .mockResolvedValueOnce({ data: existing })
    .mockResolvedValueOnce({ data: { id: 99 } });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq: updateEq }));
  const from = vi.fn(() => ({ select, upsert, update }));

  vi.doMock('@/lib/supabase/admin', () => ({
    createAdminClient: vi.fn(() => ({ from })),
  }));

  return { from, upsert, update, updateEq };
}

function mockSupabaseUser(email: string | null) {
  vi.doMock('@/lib/supabase/server', () => ({
    createClient: vi.fn(async () => ({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: email ? { email } : null },
        }),
      },
    })),
  }));
}

function jsonReq(body: unknown) {
  return new Request('http://localhost/api/onboarding', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('auth callback org-chart allowlist', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('rejects a first-time Google SSO user whose exact email is not in the org chart', async () => {
    mockOAuthUser('outside@gmail.com', { full_name: 'Outside User' });
    mockOrgAuthProfile(null);
    const admin = mockUsersTable(null);

    const { GET } = await import('@/app/auth/callback/route');
    const res = await GET(new NextRequest('http://localhost/auth/callback?code=abc'));

    expect(res.headers.get('location')).toBe('http://localhost/login?error=not_allowed');
    expect(admin.upsert).not.toHaveBeenCalled();
  });

  it('creates a first-time Google SSO user from their org-chart profile', async () => {
    mockOAuthUser('lbobis.romegasolutions@gmail.com', { full_name: 'Ignored OAuth Name' });
    mockOrgAuthProfile({
      email: 'lbobis.romegasolutions@gmail.com',
      name: 'Leighannah Bobis',
      username: 'lbobis_romegasolutions_gmail_com',
      role: 'intern',
      team: 'Marketing & Brand Content',
      jobTitle: 'Marketing and Brand Content Intern',
    });
    const admin = mockUsersTable(null);

    const { GET } = await import('@/app/auth/callback/route');
    const res = await GET(new NextRequest('http://localhost/auth/callback?code=abc'));

    expect(res.headers.get('location')).toBe('http://localhost/onboarding');
    expect(admin.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'lbobis_romegasolutions_gmail_com',
        name: 'Leighannah Bobis',
        email: 'lbobis.romegasolutions@gmail.com',
        role: 'intern',
        team: 'Marketing & Brand Content',
        job_title: 'Marketing and Brand Content Intern',
        is_active: 1,
      }),
      { onConflict: 'email', ignoreDuplicates: true },
    );
  });
});

describe('onboarding org-chart allowlist fallback', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('does not create a public user row when the authenticated email is not in the org chart', async () => {
    mockSupabaseUser('outside@gmail.com');
    mockOrgAuthProfile(null);
    const admin = mockUsersTable(null);

    const { POST } = await import('@/app/api/onboarding/route');
    const res = await POST(jsonReq({ name: 'Outside User', team: 'Marketing', role: 'ceo' }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Your email is not listed in the Romega org chart.' });
    expect(admin.upsert).not.toHaveBeenCalled();
  });

  it('creates a first-time onboarding row from the org-chart profile, not the submitted role', async () => {
    mockSupabaseUser('lbobis.romegasolutions@gmail.com');
    mockOrgAuthProfile({
      email: 'lbobis.romegasolutions@gmail.com',
      name: 'Leighannah Bobis',
      username: 'lbobis_romegasolutions_gmail_com',
      role: 'intern',
      team: 'Marketing & Brand Content',
      jobTitle: 'Marketing and Brand Content Intern',
    });
    const admin = mockUsersTable(null);

    const { POST } = await import('@/app/api/onboarding/route');
    const res = await POST(jsonReq({
      name: 'Fake Name',
      team: 'Executive & Admin',
      jobTitle: 'CEO',
      role: 'ceo',
    }));

    expect(res.status).toBe(200);
    expect(admin.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'lbobis_romegasolutions_gmail_com',
        name: 'Leighannah Bobis',
        email: 'lbobis.romegasolutions@gmail.com',
        role: 'intern',
        team: 'Marketing & Brand Content',
        job_title: 'Marketing and Brand Content Intern',
      }),
      { onConflict: 'email', ignoreDuplicates: true },
    );
  });
});
