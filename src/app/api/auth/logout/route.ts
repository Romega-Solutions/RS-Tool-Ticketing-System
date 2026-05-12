import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const supabase = await createClient();
    const session = await getSession();

    if (session) {
      const admin = createAdminClient();
      const { data: open } = await admin
        .from('timesheets')
        .select('id, clocked_in_at')
        .eq('user_id', session.id)
        .is('clocked_out_at', null)
        .maybeSingle();

      if (open) {
        return NextResponse.json(
          { clockedIn: true, clockedInAt: open.clocked_in_at },
          { status: 409 }
        );
      }
    }

    await supabase.auth.signOut();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
