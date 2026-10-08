import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeOvertime } from '@/lib/utils';
import { weeklySecondsForUser, baseWeeklySecondsForUser } from '@/lib/overtime-server';
import { route, requireSession } from '@/lib/api';

export const runtime = 'nodejs';

export const POST = route(async () => {
  const session = await requireSession();

  const admin = createAdminClient();
  // Fetch every open row, not .maybeSingle(): a user with duplicate open rows
  // would otherwise error out and be stuck clocked in forever.
  const { data: openRows, error: openError } = await admin
    .from('timesheets')
    .select('id, clocked_in_at')
    .eq('user_id', session.id)
    .is('clocked_out_at', null)
    .order('clocked_in_at', { ascending: true });

  if (openError) {
    console.error('[clock-out] lookup error:', openError.message);
    return NextResponse.json({ error: 'Failed to look up your session' }, { status: 500 });
  }

  if (!openRows || openRows.length === 0) {
    // Already closed (another tab, the cron, or an admin) — treat as success.
    return NextResponse.json({ alreadyClockedOut: true, durationSeconds: 0, isOvertime: false, overtimeSeconds: 0 });
  }

  // The earliest row is the real session; any later duplicates are closed with
  // zero duration so they don't double-count hours.
  const [open, ...duplicates] = openRows;

  const nowDate = new Date();
  const now = nowDate.toISOString();
  const durationSeconds = Math.round((Date.now() - new Date(open.clocked_in_at).getTime()) / 1000);
  // Overtime is the slice of this session beyond the user's approved-hours base.
  // The open row has a null duration, so it's naturally excluded from the week sum.
  const [weekSecondsBefore, baseSeconds] = await Promise.all([
    weeklySecondsForUser(admin, session.id, nowDate),
    baseWeeklySecondsForUser(admin, session.id),
  ]);
  const { isOvertime, overtimeSeconds } = computeOvertime(weekSecondsBefore, durationSeconds, baseSeconds);

  const { error: updateError } = await admin
    .from('timesheets')
    .update({
      clocked_out_at: now,
      duration_seconds: durationSeconds,
      is_overtime: isOvertime ? 1 : 0,
      overtime_seconds: isOvertime ? overtimeSeconds : null,
    })
    .eq('id', open.id);

  if (updateError) {
    console.error('[clock-out] update error:', updateError.message);
    return NextResponse.json({ error: 'Failed to clock out. Please try again.' }, { status: 500 });
  }

  if (duplicates.length > 0) {
    const { error: dupError } = await admin
      .from('timesheets')
      .update({ clocked_out_at: now, duration_seconds: 0, is_overtime: 0, overtime_seconds: null })
      .in('id', duplicates.map(d => d.id));
    if (dupError) console.error('[clock-out] duplicate close error:', dupError.message);
  }

  return NextResponse.json({ durationSeconds, clockedOutAt: now, isOvertime, overtimeSeconds });
});
