import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { route, requireAdmin } from '@/lib/api';

export const runtime = 'nodejs';

const VALID_STATUSES = new Set(['present', 'absent', 'wfh', 'leave', '']);
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

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

// PATCH /api/admin/attendance
// Admin-only — update weekly attendance notes, and/or day statuses, for ANY
// user. Each day field is OPTIONAL: a day key omitted from the body leaves
// that column untouched. This is what lets the week-notes editor save just
// `{ userId, weekStart, notes }` without clobbering the other six days' — per-
// day status changes normally go through the atomic PATCH /api/admin/attendance/day
// instead, which is also the only place session-vs-status consistency is
// enforced; this route does not touch `timesheets` at all.
// Body: { userId, weekStart, monday?..sunday?, notes? }
export const PATCH = route(async (req: Request) => {
  const session = await requireAdmin();

  let body: {
    userId?: number;
    weekStart?: string;
    monday?: string; tuesday?: string; wednesday?: string; thursday?: string; friday?: string;
    saturday?: string; sunday?: string;
    notes?: string | null;
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

  const dayValues: Record<string, string | null> = {};
  for (const day of DAYS) {
    if (!(day in body)) continue; // omitted entirely — leave that column untouched
    const val = (body[day] ?? '').toString().toLowerCase();
    if (!VALID_STATUSES.has(val)) {
      return NextResponse.json({ error: `Invalid status for ${day}` }, { status: 400 });
    }
    dayValues[day] = val || null;
  }

  const admin = createAdminClient();

  // Confirm the target user exists.
  const { data: targetUser } = await admin
    .from('users')
    .select('id, is_active')
    .eq('id', userId)
    .maybeSingle();
  if (!targetUser || !targetUser.is_active) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const dayColumns: Record<string, string | null> = {};
  for (const day of DAYS) {
    if (day in dayValues) dayColumns[`${day}_status`] = dayValues[day];
  }
  const payload: Record<string, string | number | null> = {
    ...dayColumns,
    submitted_at:     now,
    edited_by:        session.id,
    edited_at:        now,
  };
  if ('notes' in body) {
    payload.notes = body.notes == null ? null : body.notes.toString().trim() || null;
  }

  const { data: existing } = await admin
    .from('attendance')
    .select('id')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle();

  if (existing) {
    const { error } = await admin.from('attendance').update(payload).eq('id', existing.id);
    if (error) return NextResponse.json({ error: `Update failed: ${error.message}` }, { status: 500 });
    return NextResponse.json({ success: true, action: 'updated' });
  }

  const { error } = await admin
    .from('attendance')
    .insert({ user_id: userId, week_start: weekStart, ...payload });
  if (error) return NextResponse.json({ error: `Insert failed: ${error.message}` }, { status: 500 });

  return NextResponse.json({ success: true, action: 'created' });
});
