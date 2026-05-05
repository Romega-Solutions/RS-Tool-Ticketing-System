import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { db } from '@/db';
import { timesheets } from '@/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { clockOut } from '@/lib/presence';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('session_token')?.value;

    // Auto clock-out if user has an open session
    if (token) {
      const payload = await verifyToken(token).catch(() => null);
      if (payload?.id) {
        const userId = Number(payload.id);
        const [open] = await db
          .select({ id: timesheets.id, clockedInAt: timesheets.clockedInAt })
          .from(timesheets)
          .where(and(eq(timesheets.userId, userId), isNull(timesheets.clockedOutAt)));

        if (open) {
          const now = new Date().toISOString();
          const durationSeconds = Math.round((Date.now() - new Date(open.clockedInAt).getTime()) / 1000);
          await db
            .update(timesheets)
            .set({ clockedOutAt: now, durationSeconds })
            .where(eq(timesheets.id, open.id));
          clockOut(userId);
        }
      }
    }

    cookieStore.delete('session_token');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
