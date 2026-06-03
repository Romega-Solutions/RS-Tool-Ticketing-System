import { createServerClient } from '@supabase/ssr';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proxy } from '@/proxy';

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    },
  })),
}));

describe('proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it('does not create a Supabase client when public Supabase envs are missing', async () => {
    const request = new NextRequest('https://example.com/login');

    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(createServerClient).not.toHaveBeenCalled();
  });
});
