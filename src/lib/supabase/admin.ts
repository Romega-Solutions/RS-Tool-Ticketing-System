import { createClient } from '@supabase/supabase-js';

// Uses the service role key — NEVER expose this to the client
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key || key === 'your-service-role-key-here') {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
