import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeOvertime } from '@/lib/utils';
import { weeklySecondsForUser, baseWeeklySecondsForUser } from '@/lib/overtime-server';
import { weekStartMonday } from '@/lib/overtime-policy';
import { route, requireAdmin, requireTool } from '@/lib/api';

export const runtime = 'nodejs';

type Admin = ReturnType<typeof createAdminClient>;

function getMondayOfWeek(dateStr: string): string | null {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  if (d.getDay() !== 1) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function toLocalISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDateLabel(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Every local calendar date an interval touches, inclusive of both ends —
// a session that clocks out the next day touches two dates.
function datesTouched(startIso: string, endIso: string): string[] {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const dates: string[] = [];
  while (cur.getTime() <= last.getTime()) {
    dates.push(toLocalISO(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

const DOW_STATUS_COLUMN = [
  'sunday_status', 'monday_status', 'tuesday_status', 'wednesday_status',
  'thursday_status', 'friday_status', 'saturday_status',
] as const;

// A worked session and an Absent/Leave day can't both be true for the same
// calendar date — this blocks saving a session onto (or crossing into) one.
async function findAbsentDayConflict(
  admin: Admin,
  userId: number,
  inIso: string,
  outIso: string,
): Promise<{ date: string; status: string } | null> {
  const dates = datesTouched(inIso, outIso);
  const weekStarts = [...new Set(dates.map(d => weekStartMonday(new Date(d + 'T00:00:00'))))];
  const { data: attRows } = await admin
    .from('attendance')
    .select('*')
    .eq('user_id', userId)
    .in('week_start', weekStarts);
  const byWeek = new Map((attRows ?? []).map((r: Record<string, unknown>) => [r.week_start as string, r]));
  for (const date of dates) {
    const att = byWeek.get(weekStartMonday(new Date(date + 'T00:00:00')));
    if (!att) continue;
    const status = (att as Record<string, unknown>)[DOW_STATUS_COLUMN[new Date(date + 'T00:00:00').getDay()]] as string | null;
    if (status === 'absent' || status === 'leave') return { date, status };
  }
  return null;
}

// Blocks two sessions for the same user from overlapping in time. An open
// (still-clocked-in) session is treated as extending indefinitely.
async function findOverlappingSession(
  admin: Admin,
  userId: number,
  inIso: string,
  outIso: string | null,
  excludeId?: number,
): Promise<{ id: number } | null> {
  const startDate = toLocalISO(new Date(inIso));
  const endDate   = toLocalISO(new Date(outIso ?? inIso));
  const windowStart = toLocalISO(new Date(new Date(startDate + 'T00:00:00').getTime() - 86400000));
  const windowEnd   = toLocalISO(new Date(new Date(endDate   + 'T00:00:00').getTime() + 86400000));
  let query = admin
    .from('timesheets')
    .select('id, clocked_in_at, clocked_out_at')
    .eq('user_id', userId)
    .gte('date', windowStart)
    .lte('date', windowEnd);
  if (excludeId != null) query = query.neq('id', excludeId);
  const { data } = await query;
  const newIn  = new Date(inIso).getTime();
  const newOut = outIso ? new Date(outIso).getTime() : Infinity;
  for (const row of (data ?? []) as { id: number; clocked_in_at: string; clocked_out_at: string | null }[]) {
    const rowIn  = new Date(row.clocked_in_at).getTime();
    const rowOut = row.clocked_out_at ? new Date(row.clocked_out_at).getTime() : Infinity;
    if (newIn < rowOut && rowIn < newOut) return { id: row.id };
  }
  return null;
}

// GET /api/admin/timesheets?userId=X&week=YYYY-MM-DD
// Returns all clock-in/out sessions for a specific user for that week.
// Gated the same way as the Attendance page/roster fetch: the per-user
// Attendance checkbox (requireTool), not a hardcoded lead/admin role.
// Non-admins can only view their own team (checked below).
export const GET = route(async (req: Request) => {
  const session = await requireTool('attendance');

  const { searchParams } = new URL(req.url);
  const userIdParam = searchParams.get('userId');
  const weekParam   = searchParams.get('week');

  if (!userIdParam || !weekParam) {
    return NextResponse.json({ error: 'userId and week are required' }, { status: 400 });
  }

  const userId = parseInt(userIdParam, 10);
  if (isNaN(userId) || userId <= 0) {
    return NextResponse.json({ error: 'Invalid userId' }, { status: 400 });
  }

  const weekStart = getMondayOfWeek(weekParam);
  if (!weekStart) {
    return NextResponse.json({ error: 'week must be a Monday date (YYYY-MM-DD)' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: targetUser } = await admin
    .from('users')
    .select('id, name, team, is_active')
    .eq('id', userId)
    .maybeSingle();

  if (!targetUser || !targetUser.is_active) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (session.role !== 'admin' && targetUser.team !== session.team) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const base = new Date(weekStart + 'T00:00:00');
  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    weekDates.push(toLocalISO(new Date(base.getTime() + i * 86400000)));
  }

  // select('*') (rather than naming edited_by/edited_at) keeps this read working
  // even if the audit-columns migration hasn't been applied yet — the fields just
  // come back undefined and the tooltip stays hidden.
  const { data: tsData } = await admin
    .from('timesheets')
    .select('*')
    .eq('user_id', userId)
    .in('date', weekDates)
    .order('clocked_in_at', { ascending: true });

  // Resolve editor display names for the audit-trail tooltip in one round-trip.
  const editorIds = [...new Set((tsData ?? [])
    .map((r: { edited_by?: number | null }) => r.edited_by ?? null)
    .filter((v): v is number => typeof v === 'number'))];
  const editorNames: Record<number, string> = {};
  if (editorIds.length > 0) {
    const { data: editors } = await admin.from('users').select('id, name').in('id', editorIds);
    for (const e of (editors ?? []) as { id: number; name: string }[]) editorNames[e.id] = e.name;
  }

  const timesheets = (tsData ?? []).map((row: {
    id: number;
    clocked_in_at: string;
    clocked_out_at: string | null;
    duration_seconds: number | null;
    is_overtime: number | null;
    overtime_seconds: number | null;
    date: string;
    edited_by?: number | null;
    edited_at?: string | null;
  }) => ({
    id:              row.id,
    date:            row.date,
    clockedInAt:     row.clocked_in_at,
    clockedOutAt:    row.clocked_out_at,
    durationSeconds: row.duration_seconds,
    isOvertime:      row.is_overtime === 1,
    overtimeSeconds: row.overtime_seconds,
    editedAt:        row.edited_at ?? null,
    editedByName:    row.edited_by != null ? (editorNames[row.edited_by] ?? 'an admin') : null,
  }));

  return NextResponse.json({ userId, weekStart, timesheets });
});

// PATCH /api/admin/timesheets — admin-only edit of a specific session's
// clock-in / clock-out times. Recomputes duration + overtime.
//
// Body: { id: number, clockedInAt?: ISO, clockedOutAt?: ISO | null }
export const PATCH = route(async (req: Request) => {
  const session = await requireAdmin();

  let body: { id?: number; clockedInAt?: string | null; clockedOutAt?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('timesheets')
    .select('id, user_id, clocked_in_at, clocked_out_at')
    .eq('id', id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: 'Timesheet entry not found' }, { status: 404 });
  }

  const nextInIso  = body.clockedInAt  != null ? body.clockedInAt  : existing.clocked_in_at;
  const nextOutIso = body.clockedOutAt !== undefined ? body.clockedOutAt : existing.clocked_out_at;

  const inDate = new Date(nextInIso);
  if (isNaN(inDate.getTime())) {
    return NextResponse.json({ error: 'clockedInAt is not a valid date' }, { status: 400 });
  }

  let outDate: Date | null = null;
  if (nextOutIso) {
    outDate = new Date(nextOutIso);
    if (isNaN(outDate.getTime())) {
      return NextResponse.json({ error: 'clockedOutAt is not a valid date' }, { status: 400 });
    }
    if (outDate.getTime() <= inDate.getTime()) {
      return NextResponse.json({ error: 'clockedOutAt must be after clockedInAt' }, { status: 400 });
    }
  }

  const overlap = await findOverlappingSession(admin, existing.user_id, inDate.toISOString(), outDate ? outDate.toISOString() : null, id);
  if (overlap) {
    return NextResponse.json({ error: 'This overlaps another clock-in/out session for this user.' }, { status: 409 });
  }
  const absentConflict = await findAbsentDayConflict(admin, existing.user_id, inDate.toISOString(), (outDate ?? inDate).toISOString());
  if (absentConflict) {
    const label = absentConflict.status === 'absent' ? 'Absent' : 'Leave';
    return NextResponse.json({ error: `${fmtDateLabel(absentConflict.date)} is tagged ${label} — change that day's status before saving a session on it.` }, { status: 409 });
  }

  const update: Record<string, string | number | null> = {
    clocked_in_at: inDate.toISOString(),
    clocked_out_at: outDate ? outDate.toISOString() : null,
    date: toLocalISO(inDate),
    edited_by: session.id,
    edited_at: new Date().toISOString(),
  };

  if (outDate) {
    const durationSeconds = Math.round((outDate.getTime() - inDate.getTime()) / 1000);
    // Weekly OT for this row: sum the user's other completed sessions in the
    // edited row's week, then take the slice of this session beyond 15h.
    const [weekSecondsBefore, baseSeconds] = await Promise.all([
      weeklySecondsForUser(admin, existing.user_id, inDate, id),
      baseWeeklySecondsForUser(admin, existing.user_id),
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

  const { error } = await admin.from('timesheets').update(update).eq('id', id);
  if (error) {
    return NextResponse.json({ error: `Update failed: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});

// POST /api/admin/timesheets — admin-only creation of a session entry for a
// day that has no clock-in record at all (e.g. the user was tagged present
// but couldn't clock in themselves because they'd hit the weekly hour cap).
//
// Body: { userId: number, clockedInAt: ISO, clockedOutAt?: ISO | null }
export const POST = route(async (req: Request) => {
  const session = await requireAdmin();

  let body: { userId?: number; clockedInAt?: string; clockedOutAt?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const userId = Number(body.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }
  if (!body.clockedInAt) {
    return NextResponse.json({ error: 'clockedInAt is required' }, { status: 400 });
  }

  const inDate = new Date(body.clockedInAt);
  if (isNaN(inDate.getTime())) {
    return NextResponse.json({ error: 'clockedInAt is not a valid date' }, { status: 400 });
  }

  let outDate: Date | null = null;
  if (body.clockedOutAt) {
    outDate = new Date(body.clockedOutAt);
    if (isNaN(outDate.getTime())) {
      return NextResponse.json({ error: 'clockedOutAt is not a valid date' }, { status: 400 });
    }
    if (outDate.getTime() <= inDate.getTime()) {
      return NextResponse.json({ error: 'clockedOutAt must be after clockedInAt' }, { status: 400 });
    }
  }

  const admin = createAdminClient();
  const { data: targetUser } = await admin
    .from('users')
    .select('id, is_active')
    .eq('id', userId)
    .maybeSingle();
  if (!targetUser || !targetUser.is_active) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const overlap = await findOverlappingSession(admin, userId, inDate.toISOString(), outDate ? outDate.toISOString() : null);
  if (overlap) {
    return NextResponse.json({ error: 'This overlaps another clock-in/out session for this user.' }, { status: 409 });
  }
  const absentConflict = await findAbsentDayConflict(admin, userId, inDate.toISOString(), (outDate ?? inDate).toISOString());
  if (absentConflict) {
    const label = absentConflict.status === 'absent' ? 'Absent' : 'Leave';
    return NextResponse.json({ error: `${fmtDateLabel(absentConflict.date)} is tagged ${label} — change that day's status before saving a session on it.` }, { status: 409 });
  }

  const insert: Record<string, string | number | null> = {
    user_id:        userId,
    clocked_in_at:  inDate.toISOString(),
    clocked_out_at: outDate ? outDate.toISOString() : null,
    date:           toLocalISO(inDate),
    edited_by:      session.id,
    edited_at:      new Date().toISOString(),
  };

  if (outDate) {
    const durationSeconds = Math.round((outDate.getTime() - inDate.getTime()) / 1000);
    const [weekSecondsBefore, baseSeconds] = await Promise.all([
      weeklySecondsForUser(admin, userId, inDate),
      baseWeeklySecondsForUser(admin, userId),
    ]);
    const { isOvertime, overtimeSeconds } = computeOvertime(weekSecondsBefore, durationSeconds, baseSeconds);
    insert.duration_seconds = durationSeconds;
    insert.is_overtime = isOvertime ? 1 : 0;
    insert.overtime_seconds = isOvertime ? overtimeSeconds : null;
  } else {
    insert.duration_seconds = null;
    insert.is_overtime = 0;
    insert.overtime_seconds = null;
  }

  const { error } = await admin.from('timesheets').insert(insert);
  if (error) {
    return NextResponse.json({ error: `Create failed: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});

// DELETE /api/admin/timesheets?id=N — admin-only removal of a session entry.
export const DELETE = route(async (req: Request) => {
  await requireAdmin();

  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get('id') ?? '', 10);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'id query param is required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('timesheets').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: `Delete failed: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ success: true });
});
