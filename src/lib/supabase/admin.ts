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

// Find a Supabase Auth user by email. supabase-js admin has no direct email
// lookup, so we paginate listUsers. Used both to recover orphaned auth
// accounts and to locate the auth record that needs updating when a
// public.users row's email changes.
export async function findAuthUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<{ id: string } | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data.users.length) return null;
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === target);
    if (hit) return { id: hit.id };
    if (data.users.length < 200) return null;
  }
  return null;
}
