import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { clockOut } from '@/lib/presence';

export const runtime = 'nodejs';

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: open } = await admin
    .from('timesheets')
    .select('id, clocked_in_at')
    .eq('user_id', session.id)
    .is('clocked_out_at', null)
    .maybeSingle();

  if (!open) {
    return NextResponse.json({ error: 'No open clock-in session found' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const durationSeconds = Math.round((Date.now() - new Date(open.clocked_in_at).getTime()) / 1000);

  await admin
    .from('timesheets')
    .update({ clocked_out_at: now, duration_seconds: durationSeconds })
    .eq('id', open.id);

  clockOut(session.id);

  return NextResponse.json({ durationSeconds, clockedOutAt: now });
}
