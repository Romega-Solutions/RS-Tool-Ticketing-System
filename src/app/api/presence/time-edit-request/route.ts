import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { route, requireSession } from '@/lib/api';
import { normalizeRole } from '@/lib/rbac';
import { isAllowedTimesheetEditDoc, uploadTimesheetEditDocument } from '@/lib/storage';
import { notifyTimeEditRequested } from '@/lib/notifications';

export const runtime = 'nodejs';

const MAX_DOC_BYTES = 10 * 1024 * 1024; // 10 MB

function fmtDateLabel(date: string): string {
  const d = new Date(date + 'T00:00:00');
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
}

// POST — an IC files a correction request for ONE of their own clock sessions.
// The request is stored as 'pending' and never overwrites the timesheet until a
// team lead or admin approves it. Accepts multipart form-data so an optional
// supporting document can ride along.
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
    })
    .select('id')
    .single();
  if (error || !inserted) {
    return NextResponse.json({ error: `Could not file request: ${error?.message ?? 'unknown'}` }, { status: 500 });
  }

  // Notify the approvers: active leads on the IC's team + all active admins.
  const { data: users } = await admin.from('users').select('id, role, team, is_active');
  const approverIds = (users ?? [])
    .filter((u: { id: number; role: string; team: string | null; is_active: number | boolean | null }) =>
      (u.is_active === 1 || u.is_active === true) && u.id !== session.id)
    .filter((u: { role: string; team: string | null }) => {
      const r = normalizeRole(u.role);
      return r === 'admin' || (r === 'lead' && (u.team ?? '') === (session.team ?? ''));
    })
    .map((u: { id: number }) => u.id);

  await notifyTimeEditRequested({
    recipientIds: approverIds,
    actorId:      session.id,
    actorName:    session.name,
    dateLabel:    fmtDateLabel(ts.date),
  });

  return NextResponse.json({ ok: true, id: inserted.id });
});
