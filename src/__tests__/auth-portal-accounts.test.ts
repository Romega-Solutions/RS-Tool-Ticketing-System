import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Accounts are admin-created in User Management; sign-in never creates users
// or copies profile data from anywhere else.

function mockOAuthUser(email: string) {
  vi.doMock('@supabase/ssr', () => ({
    createServerClient: vi.fn(() => ({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          data: { session: { user: { email, user_metadata: {} } } },
          error: null,
        }),
      },
    })),
  }));
}


function mockUsersTable(existing: { id: number; team: string | null } | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: existing });
  const select = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) }));
  const upsert = vi.fn();
  const updateIs = vi.fn().mockResolvedValue({ error: null });
  const updateEq = vi.fn(() => ({ is: updateIs }));
  const update = vi.fn(() => ({ eq: updateEq }));
  vi.doMock('@/lib/supabase/admin', () => ({
    createAdminClient: vi.fn(() => ({ from: vi.fn(() => ({ select, upsert, update })) })),
  }));
  return { upsert, update, updateEq, updateIs };
}


describe('auth callback', () => {
  beforeEach(() => { vi.resetModules(); vi.restoreAllMocks(); });

  it('rejects an email with no portal account and never creates one', async () => {
    mockOAuthUser('outside@gmail.com');
    const admin = mockUsersTable(null);
    const { GET } = await import('@/app/auth/callback/route');
    const res = await GET(new NextRequest('http://localhost/auth/callback?code=abc'));
    expect(res.headers.get('location')).toBe('http://localhost/login?error=not_allowed');
    expect(admin.upsert).not.toHaveBeenCalled();
  });

  it('signs in an existing user without touching their profile', async () => {
    mockOAuthUser('rowan.okonkwo@romega-solutions.com');
    const admin = mockUsersTable({ id: 7, team: 'Technical' });
    const { GET } = await import('@/app/auth/callback/route');
    const res = await GET(new NextRequest('http://localhost/auth/callback?code=abc'));
    expect(res.headers.get('location')).toBe('http://localhost/dashboard');
    expect(admin.update).not.toHaveBeenCalled();
  });
});
