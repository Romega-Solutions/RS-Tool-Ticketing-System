import { createAdminClient } from '@/lib/supabase/admin';
import type { SessionUser } from '@/lib/session';
import {
  buildReportingGraph,
  computeVisibleUserIds,
  getImmediateSupervisor,
  hasReports,
  type ReportingGraph,
} from '@/lib/reporting-tree';

type Admin = ReturnType<typeof createAdminClient>;

/** Loads the whole reporting graph (all users, active or not) in three reads. */
export async function loadReportingGraph(admin: Admin = createAdminClient()): Promise<ReportingGraph> {
  const [usersRes, reportingRes, secondaryRes] = await Promise.all([
    admin.from('users').select('id, role, is_active'),
    admin.from('user_reporting').select('user_id, reports_to_user_id, is_hidden'),
    admin.from('user_secondary_leads').select('user_id, also_reports_to_user_id'),
  ]);
  // Fail closed: a partial graph could hide or expose the wrong people.
  const error = usersRes.error ?? reportingRes.error ?? secondaryRes.error;
  if (error) throw new Error(`reporting tree: ${error.message}`);

  return buildReportingGraph(
    ((usersRes.data ?? []) as { id: number; role: string | null; is_active: number | boolean }[])
      .map(u => ({ id: u.id, role: u.role, isActive: Boolean(u.is_active) })),
    ((reportingRes.data ?? []) as { user_id: number; reports_to_user_id: number | null; is_hidden: boolean | null }[])
      .map(r => ({ userId: r.user_id, reportsToUserId: r.reports_to_user_id, isHidden: Boolean(r.is_hidden) })),
    ((secondaryRes.data ?? []) as { user_id: number; also_reports_to_user_id: number }[])
      .map(r => ({ userId: r.user_id, alsoReportsToUserId: r.also_reports_to_user_id })),
  );
}

/**
 * Who this session may see on Attendance: 'all' for admins (which includes
 * founder/ceo/owner via normalizeRole), otherwise their own id plus everyone
 * below them in the reporting chain.
 *
 * Uses session.id/session.role as-is. When an admin is viewing the app as
 * someone, those describe the viewed user, so the admin sees exactly what that
 * person would see. View-as can only target non-admins, so this never reaches
 * more than the admin already has.
 */
export async function getVisibleUserIds(
  session: Pick<SessionUser, 'id' | 'role'>,
  admin?: Admin,
): Promise<'all' | number[]> {
  if (session.role === 'admin') return 'all';
  return computeVisibleUserIds(await loadReportingGraph(admin), session.id);
}

export async function canSeeUserAttendance(
  session: Pick<SessionUser, 'id' | 'role'>,
  userId: number,
  admin?: Admin,
): Promise<boolean> {
  const visible = await getVisibleUserIds(session, admin);
  return visible === 'all' || visible.includes(userId);
}

/** The user's main lead (founder default applied); null for the founder. */
export async function getImmediateSupervisorId(userId: number, admin?: Admin): Promise<number | null> {
  return getImmediateSupervisor(await loadReportingGraph(admin), userId);
}

/** True when anyone reports to this user (main or "also reports to"). */
export async function userHasReports(userId: number, admin?: Admin): Promise<boolean> {
  return hasReports(await loadReportingGraph(admin), userId);
}
