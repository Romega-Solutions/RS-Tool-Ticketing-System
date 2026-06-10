import { seedUsers, type PresenceUser } from '@/lib/presence';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPhotoResolver } from '@/lib/orgchart';
import { weeklySecondsForUsers } from '@/lib/overtime-server';
import { normalizeRole } from '@/lib/rbac';

export async function hydrateOpenPresenceFromDB(): Promise<void> {
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
      if (!u) continue;
      toSeed.push({
        userId: s.user_id,
        name: u.name,
        role: normalizeRole(u.role),
        team: u.team,
        clockedInAt: s.clocked_in_at,
        weekSecondsBefore: weekByUser.get(s.user_id) ?? 0,
        photoUrl: resolvePhoto({ name: u.name, email: u.email }),
      });
    }

    seedUsers(toSeed);
  } catch {
    // Hydration is a best-effort recovery path; callers can still use memory.
  }
}
