import type { PresenceUser } from '@/lib/presence';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPhotoResolver } from '@/lib/orgchart';
import { weeklySecondsForUsers } from '@/lib/overtime-server';
import { normalizeRole } from '@/lib/rbac';

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Everyone currently clocked in, read from open `timesheets` rows. The DB is the
 * only source of truth: an in-memory map is per serverless instance, so it kept
 * showing people as online after they clocked out on another instance.
 */
export async function loadOnlineUsers(admin: Admin, now: Date): Promise<PresenceUser[]> {
  const { data: openSessions, error } = await admin
    .from('timesheets')
    .select('user_id, clocked_in_at')
    .is('clocked_out_at', null)
    .order('clocked_in_at', { ascending: true });
  if (error) throw new Error(`Failed to load open sessions: ${error.message}`);
  if (!openSessions?.length) return [];

  // Earliest open row per user wins, matching clock-out's handling of duplicates.
  const clockedInAtByUser = new Map<number, string>();
  for (const s of openSessions as { user_id: number; clocked_in_at: string }[]) {
    if (!clockedInAtByUser.has(s.user_id)) clockedInAtByUser.set(s.user_id, s.clocked_in_at);
  }
  const userIds = [...clockedInAtByUser.keys()];

  const [{ data: users, error: usersError }, resolvePhoto, weekByUser] = await Promise.all([
    admin
      .from('users')
      .select('id, name, email, role, team')
      .in('id', userIds)
      .eq('is_active', 1),
    getPhotoResolver(),
    weeklySecondsForUsers(admin, userIds, now),
  ]);
  if (usersError) throw new Error(`Failed to load online users: ${usersError.message}`);

  return ((users ?? []) as { id: number; name: string; email: string | null; role: string; team: string | null }[]).map(u => ({
    userId: u.id,
    name: u.name,
    role: normalizeRole(u.role),
    team: u.team,
    clockedInAt: clockedInAtByUser.get(u.id)!,
    weekSecondsBefore: weekByUser.get(u.id) ?? 0,
    photoUrl: resolvePhoto({ name: u.name, email: u.email }),
  }));
}

/** Whether this user has an open (clocked-in) timesheet row. */
export async function isUserClockedIn(admin: Admin, userId: number): Promise<boolean> {
  const { data, error } = await admin
    .from('timesheets')
    .select('id')
    .eq('user_id', userId)
    .is('clocked_out_at', null)
    .limit(1);
  if (error) throw new Error(`Failed to check clock-in status: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
