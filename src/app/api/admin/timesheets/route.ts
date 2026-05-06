import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { canAccessReports } from '@/lib/rbac';
import { createAdminClient } from '@/lib/supabase/admin';

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

  // Verify the target user exists and lead can only see their team
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

  // Build the Mon–Sun date range
  const base = new Date(weekStart + 'T00:00:00');
  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    weekDates.push(toLocalISO(new Date(base.getTime() + i * 86400000)));
  }

  const { data: tsData } = await admin
    .from('timesheets')
    .select('id, clocked_in_at, clocked_out_at, duration_seconds, date')
    .eq('user_id', userId)
    .in('date', weekDates)
    .order('clocked_in_at', { ascending: true });

  const timesheets = (tsData ?? []).map((row: {
    id: number;
    clocked_in_at: string;
    clocked_out_at: string | null;
    duration_seconds: number | null;
    date: string;
  }) => ({
    id:              row.id,
    date:            row.date,
    clockedInAt:     row.clocked_in_at,
    clockedOutAt:    row.clocked_out_at,
    durationSeconds: row.duration_seconds,
  }));

  return NextResponse.json({ userId, weekStart, timesheets });
}
