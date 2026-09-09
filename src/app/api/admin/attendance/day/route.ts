import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { weekStartMonday } from '@/lib/overtime-policy';
import { route, requireAdmin } from '@/lib/api';

export const runtime = 'nodejs';

const VALID_STATUSES = new Set(['present', 'wfh', 'absent', 'leave']);
const WORKABLE_STATUSES = new Set(['present', 'wfh']);

function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function getMondayOfWeek(dateStr: string): string | null {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  if (d.getDay() !== 1) return null;
  return toLocalISO(d);
}

interface SessionInput { id?: number; clockedInAt?: string; clockedOutAt?: string | null; }

// PATCH /api/admin/attendance/day — admin-only, atomic per-day save.
//
// Replaces the old "edit whole week in one modal" flow: this sets ONE day's
// attendance status plus the FULL replacement set of that day's clock-in/out
// sessions, atomically, so a save can never leave the day's status and its
// sessions inconsistent with each other (the failure mode the old multi-call
// save was exposed to).
//
// Atomicity here comes from a Postgres function (`save_attendance_day`,
// docs/migrations/add-attendance-day-save-rpc.sql) invoked via
// createAdminClient().rpc(...) — a single RPC call is one transaction
// server-side. This route deliberately does NOT open a direct Postgres
// connection (no `DATABASE_URL` / Drizzle): every DB access in this app goes
// through the service-role PostgREST client, which structurally cannot issue
// schema changes, unlike a raw Postgres connection would be able to.
//
// Sessions are keyed to their clock-in date — the RPC only ever touches
// `timesheets` rows whose `date` equals `body.date`. Any such row not present
// in `sessions` is deleted; the modal sends the day's full desired session
// list, not a diff.
//
// Body: {
//   userId: number,
//   weekStart: string (Monday YYYY-MM-DD),
//   date: string (YYYY-MM-DD, must fall within that week),
//   status: 'present' | 'wfh' | 'absent' | 'leave',
//   sessions: Array<{ id?: number; clockedInAt: ISO; clockedOutAt?: ISO | null }>,
// }
//
// Hard server-side rule — this is the actual fix for the bug where a day with
// no workable status could still carry timesheet sessions (the old validation
// only blocked Absent/Leave, never required Present/WFH). A non-workable
// status with a non-empty `sessions` array is rejected outright — checked
// here for a fast, DB-free failure, and re-checked inside the RPC itself so
// the rule holds even if this route is ever bypassed.
export const PATCH = route(async (req: Request) => {
  const session = await requireAdmin();

  let body: {
    userId?: number;
    weekStart?: string;
    date?: string;
    status?: string;
    sessions?: SessionInput[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const userId = Number(body.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const weekStart = getMondayOfWeek(body.weekStart ?? '');
  if (!weekStart) {
    return NextResponse.json({ error: 'weekStart must be a Monday (YYYY-MM-DD)' }, { status: 400 });
  }

  const date = body.date ?? '';
  const dateObj = new Date(date + 'T00:00:00');
  if (!date || isNaN(dateObj.getTime())) {
    return NextResponse.json({ error: 'date is invalid' }, { status: 400 });
  }
  if (weekStartMonday(dateObj) !== weekStart) {
    return NextResponse.json({ error: "date must fall within weekStart's Mon–Sun week" }, { status: 400 });
  }

  const status = (body.status ?? '').toLowerCase();
  if (!VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: 'status must be one of present, wfh, absent, leave' }, { status: 400 });
  }
  const workable = WORKABLE_STATUSES.has(status);

  const rawSessions = Array.isArray(body.sessions) ? body.sessions : [];

  if (!workable && rawSessions.length > 0) {
    return NextResponse.json(
      { error: `${status === 'absent' ? 'Absent' : 'Leave'} days can't have clock-in/out sessions — remove them first.` },
      { status: 400 },
    );
  }

  type NormSession = { id?: number; inIso: string; outIso: string | null };
  const normalized: NormSession[] = [];
  for (const s of rawSessions) {
    if (!s.clockedInAt) {
      return NextResponse.json({ error: 'Clock-in time is required for every session.' }, { status: 400 });
    }
    const inDate = new Date(s.clockedInAt);
    if (isNaN(inDate.getTime())) {
      return NextResponse.json({ error: 'A session has an invalid clock-in time.' }, { status: 400 });
    }
    let outDate: Date | null = null;
    if (s.clockedOutAt) {
      outDate = new Date(s.clockedOutAt);
      if (isNaN(outDate.getTime())) {
        return NextResponse.json({ error: 'A session has an invalid clock-out time.' }, { status: 400 });
      }
      if (outDate.getTime() <= inDate.getTime()) {
        return NextResponse.json({ error: 'Clock-out must be after clock-in.' }, { status: 400 });
      }
    }
    // Sessions can only be edited from the day they're keyed to (their
    // clock-in date) — a cross-midnight session belongs to the day it starts.
    if (toLocalISO(inDate) !== date) {
      return NextResponse.json({ error: "A session must start on the day you're editing." }, { status: 400 });
    }
    normalized.push({ id: s.id, inIso: inDate.toISOString(), outIso: outDate ? outDate.toISOString() : null });
  }

  // No two of this day's sessions may overlap each other. (Re-checked inside
  // the RPC against the DB's current state; this is just a fast pre-check.)
  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      const a = normalized[i], b = normalized[j];
      const aOut = a.outIso ? new Date(a.outIso).getTime() : Infinity;
      const bOut = b.outIso ? new Date(b.outIso).getTime() : Infinity;
      const aIn = new Date(a.inIso).getTime();
      const bIn = new Date(b.inIso).getTime();
      if (aIn < bOut && bIn < aOut) {
        return NextResponse.json({ error: 'Two sessions on this day overlap in time.' }, { status: 409 });
      }
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

  const { error } = await admin.rpc('save_attendance_day', {
    p_user_id: userId,
    p_week_start: weekStart,
    p_date: date,
    p_status: status,
    p_sessions: normalized.map(n => ({ id: n.id ?? null, clockedInAt: n.inIso, clockedOutAt: n.outIso })),
    p_edited_by: session.id,
  });

  if (error) {
    // The RPC raises plain exceptions for validation/overlap/absent-day
    // conflicts (recognizable text) vs. genuine unexpected DB failures.
    const isConflict = /overlaps|tagged|can't have|must start|Clock-out|Clock-in|status must be/.test(error.message);
    if (!isConflict) console.error('[PATCH /api/admin/attendance/day] RPC failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: isConflict ? 409 : 500 });
  }

  return NextResponse.json({ success: true });
});
