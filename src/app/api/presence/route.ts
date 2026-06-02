import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOnline, getMyEntry, clockIn } from '@/lib/presence';
import { getPhotoResolver } from '@/lib/orgchart';
import { weeklySecondsForUser } from '@/lib/overtime-server';
import type { AppRole } from '@/lib/rbac';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const online = getOnline(session.role, session.team, session.id);

  const admin = createAdminClient();
  const weekSecondsBefore = await weeklySecondsForUser(admin, session.id, new Date());

  const myEntry = getMyEntry(session.id);
  let openSession: { timesheetId: number; clockedInAt: string; notes: string | null } | null = null;

  if (myEntry) {
    openSession = { timesheetId: -1, clockedInAt: myEntry.clockedInAt, notes: null };
  } else {
    const photoUrl = (await getPhotoResolver())({ name: session.name, email: session.email });
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
      if (openFallback) {
        openSession = { timesheetId: openFallback.id, clockedInAt: openFallback.clocked_in_at, notes: null };
        clockIn({ userId: session.id, name: session.name, role: session.role as AppRole, team: session.team, clockedInAt: openFallback.clocked_in_at, weekSecondsBefore, photoUrl });
      }
    } else if (openWithNotes) {
      openSession = { timesheetId: openWithNotes.id, clockedInAt: openWithNotes.clocked_in_at, notes: openWithNotes.notes ?? null };
      clockIn({ userId: session.id, name: session.name, role: session.role as AppRole, team: session.team, clockedInAt: openWithNotes.clocked_in_at, weekSecondsBefore, photoUrl });
    }
  }

  return NextResponse.json({ online, openSession, weekSecondsBefore });
}
