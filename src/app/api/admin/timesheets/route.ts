import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { canAccessReports, canAccessAdmin } from '@/lib/rbac';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeOvertime } from '@/lib/utils';

export const runtime = 'nodejs';

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

// GET /api/admin/timesheets?userId=X&week=YYYY-MM-DD
// Returns all clock-in/out sessions for a specific user for that week.
// Lead can only view their own team; admin can view anyone.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canAccessReports(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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

  const { data: tsData } = await admin
    .from('timesheets')
    .select('id, clocked_in_at, clocked_out_at, duration_seconds, is_overtime, overtime_seconds, date')
    .eq('user_id', userId)
    .in('date', weekDates)
    .order('clocked_in_at', { ascending: true });

  const timesheets = (tsData ?? []).map((row: {
    id: number;
    clocked_in_at: string;
    clocked_out_at: string | null;
    duration_seconds: number | null;
    is_overtime: number | null;
    overtime_seconds: number | null;
    date: string;
  }) => ({
    id:              row.id,
    date:            row.date,
    clockedInAt:     row.clocked_in_at,
    clockedOutAt:    row.clocked_out_at,
    durationSeconds: row.duration_seconds,
    isOvertime:      row.is_overtime === 1,
    overtimeSeconds: row.overtime_seconds,
  }));

  return NextResponse.json({ userId, weekStart, timesheets });
}

// PATCH /api/admin/timesheets — admin-only edit of a specific session's
// clock-in / clock-out times. Recomputes duration + overtime.
//
// Body: { id: number, clockedInAt?: ISO, clockedOutAt?: ISO | null }
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canAccessAdmin(session.role)) return NextResponse.json({ error: 'Admins only' }, { status: 403 });

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
    .select('id, clocked_in_at, clocked_out_at')
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

  const update: Record<string, string | number | null> = {
    clocked_in_at: inDate.toISOString(),
    clocked_out_at: outDate ? outDate.toISOString() : null,
    date: toLocalISO(inDate),
  };

  if (outDate) {
    const durationSeconds = Math.round((outDate.getTime() - inDate.getTime()) / 1000);
    const { isOvertime, overtimeSeconds } = computeOvertime(durationSeconds);
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
}

// DELETE /api/admin/timesheets?id=N — admin-only removal of a session entry.
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canAccessAdmin(session.role)) return NextResponse.json({ error: 'Admins only' }, { status: 403 });

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
}
