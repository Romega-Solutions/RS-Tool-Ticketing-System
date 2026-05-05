import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { normalizeRole } from '@/lib/rbac';
import { db } from '@/db';
import { users, timesheets } from '@/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { getOnline, getMyEntry } from '@/lib/presence';

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

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const online = getOnline(session.role, session.team, session.id);

  // Check if user has an open timesheet (for widget restore on page refresh)
  const myEntry = getMyEntry(session.id);
  let openSession: { timesheetId: number; clockedInAt: string } | null = null;

  if (myEntry) {
    openSession = { timesheetId: -1, clockedInAt: myEntry.clockedInAt };
  } else {
    // Fallback: check DB for an open row (presence store may have reset after restart)
    const [open] = await db
      .select({ id: timesheets.id, clockedInAt: timesheets.clockedInAt })
      .from(timesheets)
      .where(and(eq(timesheets.userId, session.id), isNull(timesheets.clockedOutAt)));
    if (open) openSession = { timesheetId: open.id, clockedInAt: open.clockedInAt };
  }

  return NextResponse.json({ online, openSession });
}
