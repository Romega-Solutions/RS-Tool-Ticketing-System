import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOnline, getMyEntry } from '@/lib/presence';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const online = getOnline(session.role, session.team, session.id);

  const myEntry = getMyEntry(session.id);
  let openSession: { timesheetId: number; clockedInAt: string; notes: string | null } | null = null;

  if (myEntry) {
    openSession = { timesheetId: -1, clockedInAt: myEntry.clockedInAt, notes: null };
  } else {
    const admin = createAdminClient();
    const { data: openWithNotes, error } = await admin
      .from('timesheets')
      .select('id, clocked_in_at, notes')
      .eq('user_id', session.id)
      .is('clocked_out_at', null)
      .maybeSingle();

    if (error) {
      const { data: openFallback } = await admin
        .from('timesheets')
        .select('id, clocked_in_at')
        .eq('user_id', session.id)
        .is('clocked_out_at', null)
        .maybeSingle();
      if (openFallback) openSession = { timesheetId: openFallback.id, clockedInAt: openFallback.clocked_in_at, notes: null };
    } else if (openWithNotes) {
      openSession = { timesheetId: openWithNotes.id, clockedInAt: openWithNotes.clocked_in_at, notes: openWithNotes.notes ?? null };
    }
  }

  return NextResponse.json({ online, openSession });
}
