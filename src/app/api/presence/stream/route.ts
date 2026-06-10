import { subscribe, unsubscribe, getOnline } from '@/lib/presence';
import { hydrateOpenPresenceFromDB } from '@/lib/presence-hydration';
import { route, optionalSession } from '@/lib/api';

export const runtime = 'nodejs';

export const GET = route(async () => {
  const session = await optionalSession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(ctrl) {
      subscribe({ ctrl, userId: session.id, role: session.role, team: session.team });

      // Seed in-memory store from DB so users with open sessions survive server restarts
      await hydrateOpenPresenceFromDB();

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
});
