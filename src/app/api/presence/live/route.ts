import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { subscribeToLive, unsubscribeFromLive, getAllOnline } from '@/lib/presence';

export const runtime = 'nodejs';

// GET /api/presence/live — initial snapshot of all online users (any role)
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const enc = new TextEncoder();

  const stream = new ReadableStream({
    start(ctrl) {
      subscribeToLive(session.id, ctrl);

      const snapshot = getAllOnline();
      try {
        ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'snapshot', online: snapshot })}\n\n`));
      } catch { /* client already gone */ }
    },
    cancel() {
      unsubscribeFromLive(session.id);
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
