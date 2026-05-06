import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessReports } from '@/lib/rbac';

export const runtime = 'nodejs';

const VALID_STATUSES = new Set(['present', 'absent', 'wfh', 'leave', '']);
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;
const DAY_COLS = ['monday_status', 'tuesday_status', 'wednesday_status', 'thursday_status', 'friday_status'] as const;

function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function getMondayOfWeek(dateStr: string): string | null {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  const day = d.getDay();
  if (day !== 1) return null;
  return toLocalISO(d);
}

function getMondaysInMonth(yearMonth: string): string[] {
  const [y, m] = yearMonth.split('-').map(Number);
  if (!y || !m) return [];
  const firstDay = new Date(y, m - 1, 1);
  const lastDay  = new Date(y, m, 0);
  const start = new Date(firstDay);
  const dow = start.getDay();
  start.setDate(start.getDate() + (dow === 0 ? -6 : 1 - dow));
  const mondays: string[] = [];
  const cur = new Date(start);
  while (cur <= lastDay) {
    mondays.push(toLocalISO(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return mondays;
}

function countWorkdaysInMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split('-').map(Number);
  if (!y || !m) return 0;
  const lastDay = new Date(y, m, 0).getDate();
  let count = 0;
  for (let d = 1; d <= lastDay; d++) {
    const dow = new Date(y, m - 1, d).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

function getWeekStartForDate(date: Date): string {
  const monday = new Date(date);
  const dow = monday.getDay();
  monday.setDate(monday.getDate() + (dow === 0 ? -6 : 1 - dow));
  return toLocalISO(monday);
}

function getWeekdayColumnForDate(date: Date): typeof DAY_COLS[number] | null {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return null;
  return DAY_COLS[dow - 1];
}

type AttendanceRow = {
  id: number;
  user_id: number;
  week_start: string;
  monday_status: string | null;
  tuesday_status: string | null;
  wednesday_status: string | null;
  thursday_status: string | null;
  friday_status: string | null;
  notes: string | null;
  submitted_at: string | null;
};

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canAccessReports(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const admin = createAdminClient();

  const monthParam = searchParams.get('month');
  if (monthParam) {
    const mondays = getMondaysInMonth(monthParam);
    if (mondays.length === 0) {
      return NextResponse.json({ error: 'Invalid month format (YYYY-MM)' }, { status: 400 });
    }

    let usersQuery = admin.from('users').select('id, name, team, role').eq('is_active', 1);
    if (session.role !== 'admin') {
      usersQuery = usersQuery.eq('team', session.team ?? '');
    }
    const { data: teamUsersData } = await usersQuery;
    const teamUsers = teamUsersData ?? [];

    const userIds = teamUsers.map((u: { id: number }) => u.id);
    let records: AttendanceRow[] = [];
    if (userIds.length > 0) {
      const { data } = await admin
        .from('attendance')
        .select('*')
        .in('user_id', userIds)
        .in('week_start', mondays);
      records = (data ?? []) as AttendanceRow[];
    }

    const workdays = countWorkdaysInMonth(monthParam);
    const recordsByUserAndWeek = new Map(records.map(record => [`${record.user_id}:${record.week_start}`, record] as const));

    const summary = teamUsers.map((user: { id: number; name: string; team: string | null; role: string }) => {
      let present = 0, wfh = 0, leave = 0, absent = 0;
      const [year, month] = monthParam.split('-').map(Number);
      const lastDay = new Date(year, month, 0).getDate();

      for (let day = 1; day <= lastDay; day++) {
        const date = new Date(year, month - 1, day);
        const col = getWeekdayColumnForDate(date);
        if (!col) continue;

        const rec = recordsByUserAndWeek.get(`${user.id}:${getWeekStartForDate(date)}`);
        const val = rec?.[col];
        if (val === 'present') present++;
        else if (val === 'wfh') wfh++;
        else if (val === 'leave') leave++;
        else if (val === 'absent') absent++;
      }

      return { userId: user.id, name: user.name, team: user.team, role: user.role, present, wfh, leave, absent, workdays };
    });

    // Fetch timesheet hours for the month
    const lastDayNum = new Date(Number(monthParam.split('-')[0]), Number(monthParam.split('-')[1]), 0).getDate();
    const monthStart = `${monthParam}-01`;
    const monthEnd   = `${monthParam}-${String(lastDayNum).padStart(2, '0')}`;
    const monthTsMap: Record<number, number> = {};
    if (userIds.length > 0) {
      const { data: tsData1 } = await admin
        .from('timesheets')
        .select('user_id, duration_seconds')
        .in('user_id', userIds)
        .gte('date', monthStart)
        .lte('date', monthEnd)
        .not('duration_seconds', 'is', null);
      for (const ts of (tsData1 ?? []) as { user_id: number; duration_seconds: number }[]) {
        monthTsMap[ts.user_id] = (monthTsMap[ts.user_id] ?? 0) + ts.duration_seconds;
      }
    }

    const summaryWithHours = summary.map(row => ({ ...row, totalSeconds: monthTsMap[row.userId] ?? 0 }));
    return NextResponse.json({ month: monthParam, summary: summaryWithHours, workdays });
  }

  const weekParam = searchParams.get('week');
  if (!weekParam) return NextResponse.json({ error: 'week or month parameter required' }, { status: 400 });

  const weekStart = getMondayOfWeek(weekParam);
  if (!weekStart) return NextResponse.json({ error: 'week must be a Monday date (YYYY-MM-DD)' }, { status: 400 });

  const { data: rawRecordsData } = await admin
    .from('attendance')
    .select('*')
    .eq('week_start', weekStart);
  const rawRecords = rawRecordsData ?? [];

  let usersQuery = admin.from('users').select('id, name, team, role').eq('is_active', 1);
  if (session.role !== 'admin') {
    usersQuery = usersQuery.eq('team', session.team ?? '');
  }
  const { data: teamUsersData2 } = await usersQuery;
  const teamUsers = teamUsersData2 ?? [];

  // Map snake_case DB rows to camelCase for the client
  const records = (rawRecords as AttendanceRow[]).map(r => ({
    id:               r.id,
    userId:           r.user_id,
    weekStart:        r.week_start,
    mondayStatus:     r.monday_status,
    tuesdayStatus:    r.tuesday_status,
    wednesdayStatus:  r.wednesday_status,
    thursdayStatus:   r.thursday_status,
    fridayStatus:     r.friday_status,
    notes:            r.notes,
    submittedAt:      r.submitted_at,
  }));

  // Build Mon–Sun ISO date strings for timesheet lookup
  const weekDates: string[] = [];
  const base = new Date(weekStart + 'T00:00:00');
  for (let i = 0; i < 7; i++) {
    weekDates.push(toLocalISO(new Date(base.getTime() + i * 86400000)));
  }

  // Fetch timesheet durations per user per day (multiple sessions per day summed)
  const userIds = (teamUsers as { id: number }[]).map(u => u.id);
  const timesheetsByDay: Record<string, number> = {}; // "userId:date" → seconds
  if (userIds.length > 0) {
    const { data: tsData2 } = await admin
      .from('timesheets')
      .select('user_id, date, duration_seconds')
      .in('user_id', userIds)
      .in('date', weekDates)
      .not('duration_seconds', 'is', null);
    for (const ts of (tsData2 ?? []) as { user_id: number; date: string; duration_seconds: number }[]) {
      const key = `${ts.user_id}:${ts.date}`;
      timesheetsByDay[key] = (timesheetsByDay[key] ?? 0) + ts.duration_seconds;
    }
  }

  return NextResponse.json({ weekStart, records, users: teamUsers, timesheetsByDay });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    weekStart: string;
    monday?: string; tuesday?: string; wednesday?: string; thursday?: string; friday?: string;
    notes?: string;
  };

  const weekStart = getMondayOfWeek(body.weekStart ?? '');
  if (!weekStart) return NextResponse.json({ error: 'weekStart must be a Monday (YYYY-MM-DD)' }, { status: 400 });

  const dayValues: Record<string, string | null> = {};
  for (const day of DAYS) {
    const val = (body[day] ?? '').toLowerCase();
    if (!VALID_STATUSES.has(val)) {
      return NextResponse.json({ error: `Invalid status for ${day}` }, { status: 400 });
    }
    dayValues[day] = val || null;
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('attendance')
    .select('id')
    .eq('user_id', session.id)
    .eq('week_start', weekStart)
    .maybeSingle();

  const now = new Date().toISOString();
  const payload = {
    monday_status:    dayValues.monday,
    tuesday_status:   dayValues.tuesday,
    wednesday_status: dayValues.wednesday,
    thursday_status:  dayValues.thursday,
    friday_status:    dayValues.friday,
    notes:            body.notes?.trim() || null,
    submitted_at:     now,
    updated_at:       now,
  };

  if (existing) {
    await admin.from('attendance').update(payload).eq('id', existing.id);
    return NextResponse.json({ success: true, action: 'updated' });
  }

  await admin.from('attendance').insert({ user_id: session.id, week_start: weekStart, ...payload });
  return NextResponse.json({ success: true, action: 'created' });
}
