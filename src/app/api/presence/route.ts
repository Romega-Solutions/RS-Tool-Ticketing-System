import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/db';
import { timesheets } from '@/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { getOnline, getMyEntry } from '@/lib/presence';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const online = getOnline(session.role, session.team, session.id);

  const myEntry = getMyEntry(session.id);
  let openSession: { timesheetId: number; clockedInAt: string } | null = null;

  if (myEntry) {
    openSession = { timesheetId: -1, clockedInAt: myEntry.clockedInAt };
  } else {
    const [open] = await db
      .select({ id: timesheets.id, clockedInAt: timesheets.clockedInAt })
      .from(timesheets)
      .where(and(eq(timesheets.userId, session.id), isNull(timesheets.clockedOutAt)));
    if (open) openSession = { timesheetId: open.id, clockedInAt: open.clockedInAt };
  }

  return NextResponse.json({ online, openSession });
}
