/**
 * Check (and optionally re-activate) a single user's public.users row.
 *
 *   npx tsx scripts/fix-my-account.ts <email>            # check only
 *   npx tsx scripts/fix-my-account.ts <email> --activate # set is_active=1
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const email = process.argv[2];
const doActivate = process.argv.includes('--activate');

if (!email || email.startsWith('--')) {
  console.error('Usage: npx tsx scripts/fix-my-account.ts <email> [--activate]');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: authList, error: authErr } = await supabase.auth.admin.listUsers();
  if (authErr) {
    console.error('auth.admin.listUsers failed:', authErr.message);
    process.exit(1);
  }
  const authUser = authList.users.find(u => u.email?.toLowerCase() === email.toLowerCase());

  const { data: dbUser, error: dbErr } = await supabase
    .from('users')
    .select('id, email, name, username, role, team, job_title, is_active, is_onboarding, created_at, updated_at')
    .eq('email', email)
    .maybeSingle();

  if (dbErr) {
    console.error('users select failed:', dbErr.message);
    process.exit(1);
  }

  console.log('--- Supabase auth.users ---');
  console.log(authUser
    ? { id: authUser.id, email: authUser.email, last_sign_in_at: authUser.last_sign_in_at }
    : '(no auth user with this email)');

  console.log('\n--- public.users ---');
  console.log(dbUser ?? '(no row)');

  if (!dbUser) {
    console.log('\nNo public.users row — sign in once via /login to let auth/callback create it, then re-run this.');
    process.exit(0);
  }

  if (dbUser.is_active === 1) {
    console.log('\nis_active is already 1. The "inactive" redirect must come from another bug — check Vercel logs for [auth/callback] or session errors.');
    process.exit(0);
  }

  if (!doActivate) {
    console.log('\nis_active is', dbUser.is_active, '— re-run with --activate to set it to 1.');
    process.exit(0);
  }

  const { error: updErr } = await supabase
    .from('users')
    .update({ is_active: 1, updated_at: new Date().toISOString() })
    .eq('email', email);

  if (updErr) {
    console.error('update failed:', updErr.message);
    process.exit(1);
  }
  console.log('\nis_active set to 1 for', email, '— try signing in again.');
}

main().catch(e => { console.error(e); process.exit(1); });
