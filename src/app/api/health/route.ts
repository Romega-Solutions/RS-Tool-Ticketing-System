import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const checks: Record<string, string> = {};

  checks.jwt_secret   = process.env.JWT_SECRET   ? 'SET' : 'MISSING — set in Vercel env vars';
  checks.database_url = process.env.DATABASE_URL  ? 'SET' : 'MISSING — set in Vercel env vars';

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
