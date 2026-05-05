import { getSession } from '@/lib/session';
import { subscribe, unsubscribe, getOnline } from '@/lib/presence';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const enc = new TextEncoder();

  const stream = new ReadableStream({
    start(ctrl) {
      subscribe({ ctrl, userId: session.id, role: session.role, team: session.team });

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
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
