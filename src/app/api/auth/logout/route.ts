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
      // .limit(1), not .maybeSingle(): with duplicate open rows maybeSingle
      // errors, which used to read as "not clocked in" and let the user log out.
      // The earliest row is the real session, matching clock-in and clock-out.
      const { data: openRows, error: openError } = await admin
        .from('timesheets')
        .select('id, clocked_in_at')
        .eq('user_id', session.id)
        .is('clocked_out_at', null)
        .order('clocked_in_at', { ascending: true })
        .limit(1);

      if (openError) {
        console.error('[logout] session lookup error:', openError.message);
        return NextResponse.json({ error: 'Failed to look up your session' }, { status: 500 });
      }

      const open = openRows?.[0];
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
