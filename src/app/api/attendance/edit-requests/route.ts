import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { route, requireReports } from '@/lib/api';
import { computeOvertime } from '@/lib/utils';
import { weeklySecondsForUser, baseWeeklySecondsForUser } from '@/lib/overtime-server';
import { notifyTimeEditDecided } from '@/lib/notifications';

export const runtime = 'nodejs';

function toLocalISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtDateLabel(date: string): string {
  const d = new Date(date + 'T00:00:00');
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
}

// POST /api/attendance/edit-requests — a lead (on the IC's team) or admin
// decides a pending time-edit request.
//   { id, action: 'approve' | 'deny', comment? }
// Approve applies the requested times to the timesheet (recomputing duration +
// weekly overtime, stamping editedBy/editedAt). Deny requires a comment.
export const POST = route(async (req: Request) => {
  const session = await requireReports();

  let body: { id?: number; action?: string; comment?: string } = {};
  try { body = await req.json(); } catch { body = {}; }

  const id = Number(body.id);
  const action = body.action;
  if (!Number.isInteger(id) || id <= 0 || (action !== 'approve' && action !== 'deny')) {
    return NextResponse.json({ error: 'id and action ("approve" | "deny") are required' }, { status: 400 });
  }
  const comment = String(body.comment ?? '').trim();
  if (action === 'deny' && !comment) {
    return NextResponse.json({ error: 'A rejection comment is required when declining.' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: reqRow } = await admin
    .from('timesheet_edit_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!reqRow) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  if (reqRow.status !== 'pending') {
    return NextResponse.json({ error: 'This request has already been decided.' }, { status: 409 });
  }

  // RBAC: a lead may only act on requests from their own team; admins, anyone.
  const { data: requester } = await admin
    .from('users').select('id, name, team').eq('id', reqRow.user_id).maybeSingle();
  if (!requester) return NextResponse.json({ error: 'Requester not found' }, { status: 404 });
  if (session.role !== 'admin' && (requester.team ?? '') !== (session.team ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const nowIso = new Date().toISOString();
  const dateLabel = fmtDateLabel(reqRow.date);

  if (action === 'deny') {
    const { error } = await admin.from('timesheet_edit_requests').update({
      status: 'denied', decided_by: session.id, decided_at: nowIso, decision_comment: comment,
    }).eq('id', id);
    if (error) return NextResponse.json({ error: `Could not save decision: ${error.message}` }, { status: 500 });
    await notifyTimeEditDecided({ recipientId: reqRow.user_id, actorId: session.id, approved: false, dateLabel, comment });
    return NextResponse.json({ ok: true, status: 'denied' });
  }

  // APPROVE — apply the requested times to the linked session.
  if (!reqRow.timesheet_id) {
    return NextResponse.json({ error: 'Request has no linked session to update.' }, { status: 400 });
  }
  const { data: ts } = await admin
    .from('timesheets')
    .select('id, user_id, clocked_in_at, clocked_out_at')
    .eq('id', reqRow.timesheet_id)
    .maybeSingle();
  if (!ts) {
    return NextResponse.json({ error: 'The session no longer exists; cannot apply this edit.' }, { status: 404 });
  }

  const nextInIso  = reqRow.requested_clock_in  ?? ts.clocked_in_at;
  const nextOutIso = reqRow.requested_clock_out ?? ts.clocked_out_at;

  const inDate = new Date(nextInIso);
  if (isNaN(inDate.getTime())) return NextResponse.json({ error: 'Resulting clock-in is invalid.' }, { status: 400 });

  let outDate: Date | null = null;
  if (nextOutIso) {
    outDate = new Date(nextOutIso);
    if (isNaN(outDate.getTime())) return NextResponse.json({ error: 'Resulting clock-out is invalid.' }, { status: 400 });
    if (outDate.getTime() <= inDate.getTime()) {
      return NextResponse.json({ error: 'Clock-out must be after clock-in.' }, { status: 400 });
    }
  }

  const update: Record<string, string | number | null> = {
    clocked_in_at:  inDate.toISOString(),
    clocked_out_at: outDate ? outDate.toISOString() : null,
    date:           toLocalISO(inDate),
    edited_by:      session.id,
    edited_at:      nowIso,
  };
  if (outDate) {
    const durationSeconds = Math.round((outDate.getTime() - inDate.getTime()) / 1000);
    const [weekSecondsBefore, baseSeconds] = await Promise.all([
      weeklySecondsForUser(admin, ts.user_id, inDate, ts.id),
      baseWeeklySecondsForUser(admin, ts.user_id),
    ]);
    const { isOvertime, overtimeSeconds } = computeOvertime(weekSecondsBefore, durationSeconds, baseSeconds);
    update.duration_seconds = durationSeconds;
    update.is_overtime = isOvertime ? 1 : 0;
    update.overtime_seconds = isOvertime ? overtimeSeconds : null;
  } else {
    update.duration_seconds = null;
    update.is_overtime = 0;
    update.overtime_seconds = null;
  }

  const { error: upErr } = await admin.from('timesheets').update(update).eq('id', ts.id);
  if (upErr) return NextResponse.json({ error: `Could not apply edit: ${upErr.message}` }, { status: 500 });

  const { error: reqErr } = await admin.from('timesheet_edit_requests').update({
    status: 'approved', decided_by: session.id, decided_at: nowIso, decision_comment: comment || null,
  }).eq('id', id);
  if (reqErr) return NextResponse.json({ error: `Edit applied but status update failed: ${reqErr.message}` }, { status: 500 });

  await notifyTimeEditDecided({ recipientId: reqRow.user_id, actorId: session.id, approved: true, dateLabel });
  return NextResponse.json({ ok: true, status: 'approved' });
});
