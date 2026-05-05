import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/db';
import { timesheets } from '@/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { clockOut } from '@/lib/presence';

export const runtime = 'nodejs';

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [open] = await db
    .select({ id: timesheets.id, clockedInAt: timesheets.clockedInAt })
    .from(timesheets)
    .where(and(eq(timesheets.userId, session.id), isNull(timesheets.clockedOutAt)));

  if (!open) {
    return NextResponse.json({ error: 'No open clock-in session found' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const durationSeconds = Math.round((Date.now() - new Date(open.clockedInAt).getTime()) / 1000);

  await db
    .update(timesheets)
    .set({ clockedOutAt: now, durationSeconds })
    .where(eq(timesheets.id, open.id));

  clockOut(session.id);

  return NextResponse.json({ durationSeconds, clockedOutAt: now });
}
