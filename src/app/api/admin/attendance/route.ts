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
// Admin-only — overwrite weekly attendance status + notes for ANY user.
// Body: { userId, weekStart, monday?..sunday?, notes? }
export const PATCH = route(async (req: Request) => {
  await requireAdmin();

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
  const payload = {
    monday_status:    dayValues.monday,
    tuesday_status:   dayValues.tuesday,
    wednesday_status: dayValues.wednesday,
    thursday_status:  dayValues.thursday,
    friday_status:    dayValues.friday,
    saturday_status:  dayValues.saturday,
    sunday_status:    dayValues.sunday,
    notes:            body.notes == null ? null : body.notes.toString().trim() || null,
    submitted_at:     now,
    updated_at:       now,
  };

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
