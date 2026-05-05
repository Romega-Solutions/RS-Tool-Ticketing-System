import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { db } from '@/db';
import { timesheets } from '@/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { clockOut } from '@/lib/presence';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const supabase = await createClient();
    const session = await getSession();

    // Auto clock-out if user has an open session
    if (session) {
      const [open] = await db
        .select({ id: timesheets.id, clockedInAt: timesheets.clockedInAt })
        .from(timesheets)
        .where(and(eq(timesheets.userId, session.id), isNull(timesheets.clockedOutAt)));

      if (open) {
        const now = new Date().toISOString();
        const durationSeconds = Math.round(
          (Date.now() - new Date(open.clockedInAt).getTime()) / 1000
        );
        await db
          .update(timesheets)
          .set({ clockedOutAt: now, durationSeconds })
          .where(eq(timesheets.id, open.id));
        clockOut(session.id);
      }
    }

    await supabase.auth.signOut();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
