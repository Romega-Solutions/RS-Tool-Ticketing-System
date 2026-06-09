import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { clockOut } from '@/lib/presence';
import { computeOvertime } from '@/lib/utils';
import { weeklySecondsForUser } from '@/lib/overtime-server';
import { route, requireSession, badRequest } from '@/lib/api';

export const runtime = 'nodejs';

export const POST = route(async () => {
  const session = await requireSession();

  const admin = createAdminClient();
  const { data: open } = await admin
    .from('timesheets')
    .select('id, clocked_in_at')
    .eq('user_id', session.id)
    .is('clocked_out_at', null)
    .maybeSingle();

  if (!open) {
    throw badRequest('No open clock-in session found');
  }

  const nowDate = new Date();
  const now = nowDate.toISOString();
  const durationSeconds = Math.round((Date.now() - new Date(open.clocked_in_at).getTime()) / 1000);
  // Overtime is the slice of this session beyond the 15h weekly cap. The open
  // row has a null duration, so it's naturally excluded from the week sum.
  const weekSecondsBefore = await weeklySecondsForUser(admin, session.id, nowDate);
  const { isOvertime, overtimeSeconds } = computeOvertime(weekSecondsBefore, durationSeconds);

  await admin
    .from('timesheets')
    .update({
      clocked_out_at: now,
      duration_seconds: durationSeconds,
      is_overtime: isOvertime ? 1 : 0,
      overtime_seconds: isOvertime ? overtimeSeconds : null,
    })
    .eq('id', open.id);

  clockOut(session.id);

  return NextResponse.json({ durationSeconds, clockedOutAt: now, isOvertime, overtimeSeconds });
});
