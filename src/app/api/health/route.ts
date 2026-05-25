import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const REQUIRED_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'CRON_SECRET',
] as const;

export async function GET() {
  const checks: Record<string, string> = {};

  for (const key of REQUIRED_VARS) {
    checks[key.toLowerCase()] = process.env[key] ? 'SET' : 'MISSING — set in Vercel env vars';
  }

  try {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const admin = createAdminClient();
    const { count, error } = await admin
      .from('users')
      .select('*', { count: 'exact', head: true });
    if (error) throw new Error(error.message);
    checks.db_connection = `OK — ${count ?? 0} users`;
  } catch (e) {
    checks.db_connection = `ERROR: ${e instanceof Error ? e.message : String(e)}`;
  }

  const allOk = !Object.values(checks).some(v => v.startsWith('MISSING') || v.startsWith('ERROR'));

  return NextResponse.json({ status: allOk ? 'ok' : 'degraded', checks }, {
    status: allOk ? 200 : 500,
  });
}
