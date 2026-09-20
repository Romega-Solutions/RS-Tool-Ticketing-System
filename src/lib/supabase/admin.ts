import { createClient } from '@supabase/supabase-js';

// Uses the secret key — NEVER expose this to the client
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SECRET_KEY!;
  if (!url || !key || key === 'your-secret-key-here') {
    throw new Error('SUPABASE_SECRET_KEY is not configured.');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
