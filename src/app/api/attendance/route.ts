import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/db';
import { users, attendance } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { canAccessReports } from '@/lib/rbac';

export const runtime = 'nodejs';

const VALID_STATUSES = new Set(['present', 'absent', 'wfh', 'leave', '']);
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;

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

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canAccessReports(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { searchParams } = new URL(req.url);

  const monthParam = searchParams.get('month');
  if (monthParam) {
    const mondays = getMondaysInMonth(monthParam);
    if (mondays.length === 0) {
      return NextResponse.json({ error: 'Invalid month format (YYYY-MM)' }, { status: 400 });
    }

    const teamUsers = session.role === 'admin'
      ? await db.select({ id: users.id, name: users.name, team: users.team, role: users.role })
          .from(users).where(eq(users.isActive, 1))
      : await db.select({ id: users.id, name: users.name, team: users.team, role: users.role })
          .from(users).where(and(eq(users.isActive, 1), eq(users.team, session.team ?? '')));

    const userIds = teamUsers.map(u => u.id);
    const records = userIds.length > 0
      ? await db.select().from(attendance)
          .where(and(inArray(attendance.userId, userIds), inArray(attendance.weekStart, mondays)))
      : [];

    const DAY_STATUS_COLS = ['mondayStatus', 'tuesdayStatus', 'wednesdayStatus', 'thursdayStatus', 'fridayStatus'] as const;
    const workdays = countWorkdaysInMonth(monthParam);

    const summary = teamUsers.map(user => {
      const userRecs = records.filter(r => r.userId === user.id);
      let present = 0, wfh = 0, leave = 0, absent = 0;
      for (const rec of userRecs) {
        for (const col of DAY_STATUS_COLS) {
          const val = rec[col];
          if (val === 'present') present++;
          else if (val === 'wfh')  wfh++;
          else if (val === 'leave') leave++;
          else if (val === 'absent') absent++;
        }
      }
      return { userId: user.id, name: user.name, team: user.team, role: user.role, present, wfh, leave, absent, workdays };
    });

    return NextResponse.json({ month: monthParam, summary, workdays });
  }

  const weekParam = searchParams.get('week');
  if (!weekParam) return NextResponse.json({ error: 'week or month parameter required' }, { status: 400 });

  const weekStart = getMondayOfWeek(weekParam);
  if (!weekStart) return NextResponse.json({ error: 'week must be a Monday date (YYYY-MM-DD)' }, { status: 400 });

  const records = await db.select().from(attendance).where(eq(attendance.weekStart, weekStart));

  const teamUsers = session.role === 'admin'
    ? await db.select({ id: users.id, name: users.name, team: users.team, role: users.role })
        .from(users).where(eq(users.isActive, 1))
    : await db.select({ id: users.id, name: users.name, team: users.team, role: users.role })
        .from(users).where(and(eq(users.isActive, 1), eq(users.team, session.team ?? '')));

  return NextResponse.json({ weekStart, records, users: teamUsers });
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

  const [existing] = await db.select().from(attendance)
    .where(and(eq(attendance.userId, session.id), eq(attendance.weekStart, weekStart)));

  const now = new Date().toISOString();

  if (existing) {
    await db.update(attendance).set({
      mondayStatus:    dayValues.monday,
      tuesdayStatus:   dayValues.tuesday,
      wednesdayStatus: dayValues.wednesday,
      thursdayStatus:  dayValues.thursday,
      fridayStatus:    dayValues.friday,
      notes:           body.notes?.trim() || null,
      submittedAt:     now,
    }).where(eq(attendance.id, existing.id));
    return NextResponse.json({ success: true, action: 'updated' });
  }

  await db.insert(attendance).values({
    userId:          session.id,
    weekStart,
    mondayStatus:    dayValues.monday,
    tuesdayStatus:   dayValues.tuesday,
    wednesdayStatus: dayValues.wednesday,
    thursdayStatus:  dayValues.thursday,
    fridayStatus:    dayValues.friday,
    notes:           body.notes?.trim() || null,
    submittedAt:     now,
  });

  return NextResponse.json({ success: true, action: 'created' });
}
