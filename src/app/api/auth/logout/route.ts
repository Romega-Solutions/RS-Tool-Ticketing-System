import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';
import { clockOut } from '@/lib/presence';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const supabase = await createClient();
    const session = await getSession();

    // Best-effort auto clock-out — don't block logout if DB fails
    if (session) {
      const admin = createAdminClient();
      const { data: open } = await admin
        .from('timesheets')
        .select('id, clocked_in_at')
        .eq('user_id', session.id)
        .is('clocked_out_at', null)
        .maybeSingle();

      if (open) {
        const now = new Date().toISOString();
        const durationSeconds = Math.round(
          (Date.now() - new Date(open.clocked_in_at).getTime()) / 1000
        );
        const { error } = await admin
          .from('timesheets')
          .update({ clocked_out_at: now, duration_seconds: durationSeconds })
          .eq('id', open.id);
        if (error) {
          console.error('[logout] clock-out update failed:', error.message);
        } else {
          clockOut(session.id);
        }
      }
    }

    await supabase.auth.signOut();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
