import { subscribeToLive, unsubscribeFromLive, getAllOnline } from '@/lib/presence';
import { hydrateOpenPresenceFromDB } from '@/lib/presence-hydration';
import { route, requireSession } from '@/lib/api';

export const runtime = 'nodejs';

export const GET = route(async () => {
  const session = await requireSession();

  const enc = new TextEncoder();
  let streamCtrl: ReadableStreamDefaultController | null = null;

  const stream = new ReadableStream({
    async start(ctrl) {
      streamCtrl = ctrl;
      subscribeToLive(session.id, ctrl);

      // Seed in-memory store from DB so users with open sessions survive server restarts
      await hydrateOpenPresenceFromDB();

      const snapshot = getAllOnline();
      try {
        ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'snapshot', online: snapshot })}\n\n`));
      } catch { /* client already gone */ }
    },
    cancel() {
      if (streamCtrl) {
        unsubscribeFromLive(session.id, streamCtrl);
      } else {
        unsubscribeFromLive(session.id);
      }
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
