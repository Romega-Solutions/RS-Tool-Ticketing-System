import { createAdminClient } from '@/lib/supabase/admin';
import { subscribeToLive, unsubscribeFromLive, getAllOnline, seedUsers, type PresenceUser } from '@/lib/presence';
import { getPhotoResolver } from '@/lib/orgchart';
import { weeklySecondsForUsers } from '@/lib/overtime-server';
import type { AppRole } from '@/lib/rbac';
import { route, requireSession } from '@/lib/api';

export const runtime = 'nodejs';

async function hydrateFromDB(): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: openSessions } = await admin
      .from('timesheets')
      .select('user_id, clocked_in_at')
      .is('clocked_out_at', null);

    if (!openSessions?.length) return;

    const userIds = (openSessions as { user_id: number; clocked_in_at: string }[]).map(s => s.user_id);
    const { data: users } = await admin
      .from('users')
      .select('id, name, email, role, team')
      .in('id', userIds)
      .eq('is_active', 1);

    const userMap = new Map(
      ((users ?? []) as { id: number; name: string; email: string | null; role: string; team: string | null }[]).map(u => [u.id, u])
    );

    const resolvePhoto = await getPhotoResolver();
    const weekByUser = await weeklySecondsForUsers(admin, userIds, new Date());
    const toSeed: PresenceUser[] = [];
    for (const s of openSessions as { user_id: number; clocked_in_at: string }[]) {
      const u = userMap.get(s.user_id);
      if (u) {
        toSeed.push({
          userId: s.user_id,
          name: u.name,
          role: u.role as AppRole,
          team: u.team,
          clockedInAt: s.clocked_in_at,
          weekSecondsBefore: weekByUser.get(s.user_id) ?? 0,
          photoUrl: resolvePhoto({ name: u.name, email: u.email }),
        });
      }
    }
    seedUsers(toSeed);
  } catch {
    // Hydration failed — send whatever is currently in memory
  }
}

export const GET = route(async () => {
  const session = await requireSession();

  const enc = new TextEncoder();
  let streamCtrl: ReadableStreamDefaultController | null = null;

  const stream = new ReadableStream({
    async start(ctrl) {
      streamCtrl = ctrl;
      subscribeToLive(session.id, ctrl);

      // Seed in-memory store from DB so users with open sessions survive server restarts
      await hydrateFromDB();

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
