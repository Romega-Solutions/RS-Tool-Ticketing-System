import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { route, requireSession } from '@/lib/api';
import { computeOvertime } from '@/lib/utils';
import { weeklySecondsForUser, baseWeeklySecondsForUser } from '@/lib/overtime-server';
import { notifyTimeEditDecided, notifyTimeEditForwarded, notifyTimeEditRequested } from '@/lib/notifications';
import { phtDateOf } from '@/lib/pht';
import { checkDecisionRights, decisionUpdate, validateDecisionNote } from '@/lib/time-approvals';
import { activeAdminIds, fmtDateLabel, loadDirectory } from '@/lib/time-approvals-server';

export const runtime = 'nodejs';

// POST /api/attendance/edit-requests — decide one step of a pending
// time-correction request.
//   { id, action: 'approve' | 'deny', comment }
// Steps: the requester's supervisor (main lead) first, then an admin. Admins
// (founder included) may decide any open request, which counts as the admin
// step. A supervisor rejection is final; a supervisor approval hands the
// request to the admins. Only an admin approval applies the requested times to
// the timesheet (recomputing duration + weekly overtime, stamping
// editedBy/editedAt). Every decision needs a note, and nobody decides their
// own request.
export const POST = route(async (req: Request) => {
  const session = await requireSession();

  let body: { id?: number; action?: string; comment?: string } = {};
  try { body = await req.json(); } catch { body = {}; }

  const id = Number(body.id);
  const action = body.action;
  if (!Number.isInteger(id) || id <= 0 || (action !== 'approve' && action !== 'deny')) {
    return NextResponse.json({ error: 'id and action ("approve" | "deny") are required' }, { status: 400 });
  }
  const noteCheck = validateDecisionNote(action, body.comment);
  if (!noteCheck.ok) return NextResponse.json({ error: noteCheck.error }, { status: 400 });
  const comment = noteCheck.note;

  const admin = createAdminClient();

  const { data: reqRow } = await admin
    .from('timesheet_edit_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!reqRow) return NextResponse.json({ error: 'Request not found' }, { status: 404 });

  const rights = checkDecisionRights(
    {
      userId:       reqRow.user_id,
      status:       reqRow.status,
      stage:        reqRow.stage ?? null,
      supervisorId: reqRow.supervisor_id ?? null,
    },
    { id: session.id, role: session.role },
  );
  if (!rights.ok) return NextResponse.json({ error: rights.error }, { status: rights.status });

  const nowIso = new Date().toISOString();
  const dateLabel = fmtDateLabel(reqRow.date);
  const { update, applyTimesheet } = decisionUpdate(rights.step, action, session.id, comment, nowIso);

  // Saves the decision only if the request is still where we found it, so two
  // people deciding at once can't both win.
  const saveDecision = async () => {
    let q = admin.from('timesheet_edit_requests').update(update).eq('id', id).eq('status', 'pending');
    q = reqRow.stage == null ? q.is('stage', null) : q.eq('stage', reqRow.stage);
    const { data, error } = await q.select('id');
    if (error) return { error: `Could not save decision: ${error.message}`, status: 500 };
    if (!data || data.length === 0) return { error: 'This request was just decided by someone else. Refresh to see it.', status: 409 };
    return null;
  };

  if (!applyTimesheet) {
    const failed = await saveDecision();
    if (failed) return NextResponse.json({ error: failed.error }, { status: failed.status });

    if (rights.step === 'supervisor' && action === 'approve') {
      // Hand over to the admins and let the requester know where it stands.
      const directory = await loadDirectory(admin);
      const requesterName = directory.get(reqRow.user_id)?.name ?? 'A teammate';
      await Promise.all([
        notifyTimeEditRequested({
          recipientIds:   activeAdminIds(directory, [reqRow.user_id, session.id]),
          actorId:        reqRow.user_id,
          actorName:      requesterName,
          dateLabel,
          step:           'admin',
          supervisorName: session.name,
        }),
        notifyTimeEditForwarded({
          recipientId:    reqRow.user_id,
          actorId:        session.id,
          supervisorName: session.name,
          dateLabel,
        }),
      ]);
      return NextResponse.json({ ok: true, status: 'pending', stage: 'admin' });
    }

    // A rejection at either step is final.
    await notifyTimeEditDecided({ recipientId: reqRow.user_id, actorId: session.id, approved: false, dateLabel, comment });
    return NextResponse.json({ ok: true, status: 'denied' });
  }

  // ADMIN APPROVE — apply the requested times to the linked session.
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

  const tsUpdate: Record<string, string | number | null> = {
    clocked_in_at:  inDate.toISOString(),
    clocked_out_at: outDate ? outDate.toISOString() : null,
    date:           phtDateOf(inDate),
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
    tsUpdate.duration_seconds = durationSeconds;
    tsUpdate.is_overtime = isOvertime ? 1 : 0;
    tsUpdate.overtime_seconds = isOvertime ? overtimeSeconds : null;
  } else {
    tsUpdate.duration_seconds = null;
    tsUpdate.is_overtime = 0;
    tsUpdate.overtime_seconds = null;
  }

  // Claim the request before touching the timesheet so a double click (or two
  // admins at once) can't apply it twice.
  const failed = await saveDecision();
  if (failed) return NextResponse.json({ error: failed.error }, { status: failed.status });

  const { error: upErr } = await admin.from('timesheets').update(tsUpdate).eq('id', ts.id);
  if (upErr) {
    // Put the request back in the admin queue so it can be retried.
    await admin.from('timesheet_edit_requests').update({
      status: 'pending', stage: 'admin', decided_by: null, decided_at: null, decision_comment: null,
    }).eq('id', id);
    return NextResponse.json({ error: `Could not apply edit: ${upErr.message}` }, { status: 500 });
  }

  await notifyTimeEditDecided({ recipientId: reqRow.user_id, actorId: session.id, approved: true, dateLabel });
  return NextResponse.json({ ok: true, status: 'approved' });
});
