import { describe, expect, it } from 'vitest';
import { hasSupabaseAdminConfig, hasSupabaseConfig } from '@/lib/supabase/config';

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

  it('returns false when service role key is missing', () => {
    expect(hasSupabaseAdminConfig({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    })).toBe(false);
  });

  it('returns false when service role key is placeholder', () => {
    expect(hasSupabaseAdminConfig({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'your-service-role-key-here',
    })).toBe(false);
  });

  it('returns true when service role key is present', () => {
    expect(hasSupabaseAdminConfig({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    })).toBe(true);
  });
});
