import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { normalizeRole } from '@/lib/rbac';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { subscribe, unsubscribe, getOnline } from '@/lib/presence';

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
  if (!session) return new Response('Unauthorized', { status: 401 });

  const enc = new TextEncoder();

  const stream = new ReadableStream({
    start(ctrl) {
      subscribe({ ctrl, userId: session.id, role: session.role, team: session.team });

      // Send current online snapshot immediately as first event
      const snapshot = getOnline(session.role, session.team, session.id);
      try {
        ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'snapshot', online: snapshot })}\n\n`));
      } catch { /* client already gone */ }
    },
    cancel() {
      unsubscribe(session.id);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
