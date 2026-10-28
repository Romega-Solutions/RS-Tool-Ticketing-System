import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { route, requireSession } from '@/lib/api';
import { isAllowedTimesheetEditDoc, uploadTimesheetEditDocument } from '@/lib/storage';
import { notifyTimeEditReceived, notifyTimeEditRequested } from '@/lib/notifications';
import { sendTimeEditEmailAfterResponse } from '@/lib/time-edit-emails';
import { initialStage } from '@/lib/time-approvals';
import { activeAdminIds, fmtDateLabel, loadDirectory, resolveSupervisor } from '@/lib/time-approvals-server';

export const runtime = 'nodejs';

const MAX_DOC_BYTES = 10 * 1024 * 1024; // 10 MB

// POST — an IC files a correction request for ONE of their own clock sessions.
// The request is stored as 'pending' and never overwrites the timesheet until
// it passes two steps: the requester's supervisor (main lead), then an admin.
// When the supervisor is an admin or the founder it starts at the admin step.
// Accepts multipart form-data so an optional supporting document can ride along.
export const POST = route(async (req: Request) => {
  const session = await requireSession();

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 });

  const timesheetId = Number(form.get('timesheetId'));
  const reason = String(form.get('reason') ?? '').trim();
  const rawIn  = String(form.get('requestedClockIn')  ?? '').trim();
  const rawOut = String(form.get('requestedClockOut') ?? '').trim();
  const file = form.get('document');

  if (!Number.isInteger(timesheetId) || timesheetId <= 0) {
    return NextResponse.json({ error: 'A session is required.' }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: 'A reason is required.' }, { status: 400 });
  }

  const admin = createAdminClient();

  // The session must exist and belong to the requester.
  const { data: ts } = await admin
    .from('timesheets')
    .select('id, user_id, clocked_in_at, clocked_out_at, date')
    .eq('id', timesheetId)
    .maybeSingle();
  if (!ts || ts.user_id !== session.id) {
    return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  }

  // Parse requested times — a blank side means "leave that one unchanged".
  let requestedIn: string | null = null;
  let requestedOut: string | null = null;
  if (rawIn) {
    const d = new Date(rawIn);
    if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid clock-in time.' }, { status: 400 });
    requestedIn = d.toISOString();
  }
  if (rawOut) {
    const d = new Date(rawOut);
    if (isNaN(d.getTime())) return NextResponse.json({ error: 'Invalid clock-out time.' }, { status: 400 });
    requestedOut = d.toISOString();
  }
  if (!requestedIn && !requestedOut) {
    return NextResponse.json({ error: 'Enter at least one corrected time.' }, { status: 400 });
  }

  // Sanity: effective clock-out must be after effective clock-in.
  const effIn  = requestedIn  ?? ts.clocked_in_at;
  const effOut = requestedOut ?? ts.clocked_out_at;
  if (effIn && effOut && new Date(effOut).getTime() <= new Date(effIn).getTime()) {
    return NextResponse.json({ error: 'Clock-out must be after clock-in.' }, { status: 400 });
  }

  // One open request per session.
  const { data: open } = await admin
    .from('timesheet_edit_requests')
    .select('id')
    .eq('timesheet_id', timesheetId)
    .eq('status', 'pending')
    .limit(1);
  if (open && open.length > 0) {
    return NextResponse.json({ error: 'You already have a pending request for this session.' }, { status: 409 });
  }

  // Who decides first (resolved before the upload so a failed lookup
  // can't leave an orphaned document behind): the main lead, unless that's an admin/founder (or
  // there's no usable lead), in which case the request goes straight to admins.
  const directory = await loadDirectory(admin);
  const supervisor = await resolveSupervisor(admin, session.id, directory);
  const { stage, supervisorId } = initialStage(session.id, supervisor);

  // Optional supporting document.
  let documentPath: string | null = null;
  let documentName: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (!isAllowedTimesheetEditDoc(file)) {
      return NextResponse.json({ error: 'Attachment must be a PDF or image (PNG/JPG/WEBP/HEIC).' }, { status: 400 });
    }
    if (file.size > MAX_DOC_BYTES) {
      return NextResponse.json({ error: 'Attachment must be under 10 MB.' }, { status: 400 });
    }
    const up = await uploadTimesheetEditDocument({ userId: session.id, file });
    documentPath = up.path;
    documentName = up.name;
  }

  const { data: inserted, error } = await admin
    .from('timesheet_edit_requests')
    .insert({
      user_id:             session.id,
      timesheet_id:        timesheetId,
      date:                ts.date,
      current_clock_in:    ts.clocked_in_at,
      current_clock_out:   ts.clocked_out_at,
      requested_clock_in:  requestedIn,
      requested_clock_out: requestedOut,
      reason,
      document_path:       documentPath,
      document_name:       documentName,
      status:              'pending',
      stage,
      supervisor_id:       supervisorId,
    })
    .select('id, requested_at')
    .single();
  if (error || !inserted) {
    return NextResponse.json({ error: `Could not file request: ${error?.message ?? 'unknown'}` }, { status: 500 });
  }

  const dateLabel = fmtDateLabel(ts.date);
  const approverIds = stage === 'supervisor' && supervisorId != null
    ? [supervisorId]
    : activeAdminIds(directory, [session.id]);

  await Promise.all([
    notifyTimeEditReceived({ recipientId: session.id, dateLabel, step: stage }),
    notifyTimeEditRequested({
      recipientIds: approverIds,
      actorId:      session.id,
      actorName:    session.name,
      dateLabel,
      step:         stage,
    }),
  ]);

  // The designed email to the requester (supervisor copied), sent after the
  // response. Best-effort, and off unless the HTML sender is configured and on.
  sendTimeEditEmailAfterResponse({
    kind:       'received',
    waitingFor: stage,
    admin,
    request: {
      id:                inserted.id,
      userId:            session.id,
      date:              ts.date,
      currentClockIn:    ts.clocked_in_at,
      currentClockOut:   ts.clocked_out_at,
      requestedClockIn:  requestedIn,
      requestedClockOut: requestedOut,
      reason,
      documentName,
      requestedAt:       inserted.requested_at ?? new Date().toISOString(),
      supervisorId,
    },
  });

  return NextResponse.json({ ok: true, id: inserted.id, stage });
});
