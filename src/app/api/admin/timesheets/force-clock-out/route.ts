import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { clockOut } from '@/lib/presence';
import { computeOvertime } from '@/lib/utils';
import { weeklySecondsForUser } from '@/lib/overtime-server';
import { route, requireAdmin } from '@/lib/api';

export const runtime = 'nodejs';

// POST /api/admin/timesheets/force-clock-out
// Admin-only — clock out a specific user's open session.
// Body: { userId: number, clockedOutAt?: ISO string }   // default: now
export const POST = route(async (req: Request) => {
  await requireAdmin();

  let body: { userId?: number; clockedOutAt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const userId = Number(body.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: open } = await admin
    .from('timesheets')
    .select('id, clocked_in_at')
    .eq('user_id', userId)
    .is('clocked_out_at', null)
    .maybeSingle();

  if (!open) {
    return NextResponse.json({ error: 'No open clock-in session for this user' }, { status: 400 });
  }

  let outDate = new Date();
  if (body.clockedOutAt) {
    const parsed = new Date(body.clockedOutAt);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'clockedOutAt is not a valid date' }, { status: 400 });
    }
    outDate = parsed;
  }

  const inDate = new Date(open.clocked_in_at);
  if (outDate.getTime() <= inDate.getTime()) {
    return NextResponse.json({ error: 'clockedOutAt must be after clockedInAt' }, { status: 400 });
  }

  const durationSeconds = Math.round((outDate.getTime() - inDate.getTime()) / 1000);
  const weekSecondsBefore = await weeklySecondsForUser(admin, userId, outDate);
  const { isOvertime, overtimeSeconds } = computeOvertime(weekSecondsBefore, durationSeconds);

  const { error } = await admin
    .from('timesheets')
    .update({
      clocked_out_at:  outDate.toISOString(),
      duration_seconds: durationSeconds,
      is_overtime:      isOvertime ? 1 : 0,
      overtime_seconds: isOvertime ? overtimeSeconds : null,
    })
    .eq('id', open.id);

  if (error) {
    return NextResponse.json({ error: `Force clock-out failed: ${error.message}` }, { status: 500 });
  }

  // Drop from in-memory presence + broadcast to live subscribers.
  clockOut(userId);

  return NextResponse.json({
    success: true,
    durationSeconds,
    clockedOutAt: outDate.toISOString(),
    isOvertime,
    overtimeSeconds,
  });
});
