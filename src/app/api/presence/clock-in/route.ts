import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { normalizeRole } from '@/lib/rbac';
import { db } from '@/db';
import { users, timesheets, attendance } from '@/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { clockIn } from '@/lib/presence';

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
  const dow = now.getDay(); // 0=Sun, 1=Mon … 5=Fri, 6=Sat
  if (dow === 0 || dow === 6) return; // skip weekends
  const colName = DAY_COLS[dow - 1]; // Mon=index 0 … Fri=index 4
  const weekStart = getWeekMonday(now);

  const [existing] = await db.select().from(attendance)
    .where(and(eq(attendance.userId, userId), eq(attendance.weekStart, weekStart)));

  if (existing) {
    // Only set to present if the slot is currently empty — don't override a manual entry
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

export const runtime = 'nodejs';

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload?.id) return null;
  const [user] = await db.select({
    id: users.id, name: users.name, role: users.role, team: users.team,
  }).from(users).where(eq(users.id, Number(payload.id)));
  if (!user) return null;
  return { ...user, role: normalizeRole(user.role) };
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

  // Skip if already clocked in
  const [existing] = await db
    .select({ id: timesheets.id, clockedInAt: timesheets.clockedInAt })
    .from(timesheets)
    .where(and(eq(timesheets.userId, session.id), isNull(timesheets.clockedOutAt)));

  if (existing) {
    // Already have an open session — return it and register in presence store
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
