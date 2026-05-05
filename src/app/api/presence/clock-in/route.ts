import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/db';
import { timesheets, attendance } from '@/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { clockIn } from '@/lib/presence';

export const runtime = 'nodejs';

const DAY_COLS = ['mondayStatus', 'tuesdayStatus', 'wednesdayStatus', 'thursdayStatus', 'fridayStatus'] as const;

function getWeekMonday(d: Date): string {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  const dow = copy.getDay();
  copy.setDate(copy.getDate() + (dow === 0 ? -6 : 1 - dow));
  const y = copy.getFullYear();
  const m = String(copy.getMonth() + 1).padStart(2, '0');
  const dd = String(copy.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

async function autoMarkPresent(userId: number) {
  const now = new Date();
  const dow = now.getDay();
  if (dow === 0 || dow === 6) return;
  const colName = DAY_COLS[dow - 1];
  const weekStart = getWeekMonday(now);

  const [existing] = await db.select().from(attendance)
    .where(and(eq(attendance.userId, userId), eq(attendance.weekStart, weekStart)));

  if (existing) {
    if (!existing[colName]) {
      await db.update(attendance).set({ [colName]: 'present', submittedAt: now.toISOString() })
        .where(eq(attendance.id, existing.id));
    }
  } else {
    await db.insert(attendance).values({
      userId, weekStart, [colName]: 'present', submittedAt: now.toISOString(),
    });
  }
}

function localDateStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [existing] = await db
    .select({ id: timesheets.id, clockedInAt: timesheets.clockedInAt })
    .from(timesheets)
    .where(and(eq(timesheets.userId, session.id), isNull(timesheets.clockedOutAt)));

  if (existing) {
    clockIn({ userId: session.id, name: session.name, role: session.role, team: session.team, clockedInAt: existing.clockedInAt });
    return NextResponse.json({ timesheetId: existing.id, clockedInAt: existing.clockedInAt, resumed: true });
  }

  const now = new Date().toISOString();
  const [inserted] = await db
    .insert(timesheets)
    .values({ userId: session.id, clockedInAt: now, date: localDateStr() })
    .returning({ id: timesheets.id });

  const timesheetId = inserted.id;
  clockIn({ userId: session.id, name: session.name, role: session.role, team: session.team, clockedInAt: now });
  await autoMarkPresent(session.id);

  return NextResponse.json({ timesheetId, clockedInAt: now });
}
