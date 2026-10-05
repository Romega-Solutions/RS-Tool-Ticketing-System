import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { weeklySecondsForUser, weeklyAllowanceForUser, enforceUserOpenSession, maybeSweepOpenSessions } from '@/lib/overtime-server';
import { route, requireSession } from '@/lib/api';

export const runtime = 'nodejs';

export const GET = route(async () => {
  const session = await requireSession();

  const admin = createAdminClient();
  const now = new Date();
  // Close-on-read: if this user's open session has crossed the 15h cap, end it
  // now server-side instead of trusting the browser guardrail or the daily cron.
  await enforceUserOpenSession(admin, session.id, now);
  // Activity backstop: throttled sweep of *all* open sessions, so a user who
  // clocked in then never reloaded the app is still capped within ~60s while
  // anyone is using the app — not only at the daily cron.
  await maybeSweepOpenSessions(admin, now);

  const [weekSecondsBefore, weekAllowanceSeconds] = await Promise.all([
    weeklySecondsForUser(admin, session.id, now),
    weeklyAllowanceForUser(admin, session.id, now),
  ]);

  // This user's own session, read from the DB (not a per-instance memory map).

  let openSession: { timesheetId: number; clockedInAt: string; notes: string | null } | null = null;
  const { data: openRows, error } = await admin
    .from('timesheets')
    .select('id, clocked_in_at, notes')
    .eq('user_id', session.id)
    .is('clocked_out_at', null)
    .order('clocked_in_at', { ascending: false })
    .limit(1);
  const open = error
    ? (await admin
        .from('timesheets')
        .select('id, clocked_in_at')
        .eq('user_id', session.id)
        .is('clocked_out_at', null)
        .order('clocked_in_at', { ascending: false })
        .limit(1)).data?.[0]
    : openRows?.[0];

  if (open) {
    openSession = { timesheetId: open.id, clockedInAt: open.clocked_in_at, notes: 'notes' in open ? ((open.notes as string | null) ?? null) : null };
  }

  return NextResponse.json({ openSession, weekSecondsBefore, weekAllowanceSeconds });
});
