import { describe, expect, it } from 'vitest';
import { hasSupabaseConfig } from '@/lib/supabase/config';

describe('hasSupabaseConfig', () => {
  it('returns false when public Supabase envs are missing', () => {
    expect(hasSupabaseConfig({})).toBe(false);
  });

  it('returns false when either public Supabase env is missing', () => {
    expect(hasSupabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' })).toBe(false);
    expect(hasSupabaseConfig({ NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key' })).toBe(false);
  });

  it('returns true when both public Supabase envs are present', () => {
    expect(hasSupabaseConfig({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    })).toBe(true);
  });
});
