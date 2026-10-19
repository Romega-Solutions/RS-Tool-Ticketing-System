import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeRole } from '@/lib/rbac';
import { buildReportingGraph, getImmediateSupervisor } from '@/lib/reporting-tree';

type Admin = ReturnType<typeof createAdminClient>;

export type DirectoryUser = { id: number; name: string; role: string | null; isActive: boolean };

/** Every user with the fields the approval flow needs, keyed by id. */
export async function loadDirectory(admin: Admin): Promise<Map<number, DirectoryUser>> {
  const { data, error } = await admin.from('users').select('id, name, role, is_active');
  if (error) throw new Error(`users: ${error.message}`);
  const out = new Map<number, DirectoryUser>();
  for (const u of (data ?? []) as { id: number; name: string; role: string | null; is_active: number | boolean | null }[]) {
    out.set(u.id, { id: u.id, name: u.name, role: u.role, isActive: Boolean(u.is_active) });
  }
  return out;
}

/**
 * The requester's supervisor: their main lead from user_reporting, with the
 * same founder default as User Management. "Also reports to" leads are not
 * approvers. Null when the requester has no lead (the founder).
 */
export async function resolveSupervisor(
  admin: Admin,
  requesterId: number,
  directory: Map<number, DirectoryUser>,
): Promise<DirectoryUser | null> {
  const { data: row, error } = await admin
    .from('user_reporting')
    .select('user_id, reports_to_user_id, is_hidden')
    .eq('user_id', requesterId)
    .maybeSingle();
  if (error) throw new Error(`user_reporting: ${error.message}`);
  const users = [...directory.values()].map(u => ({ id: u.id, role: u.role, isActive: u.isActive }));
  const reporting = row
    ? [{ userId: row.user_id as number, reportsToUserId: (row.reports_to_user_id as number | null) ?? null, isHidden: Boolean(row.is_hidden) }]
    : [];
  const supervisorId = getImmediateSupervisor(buildReportingGraph(users, reporting, []), requesterId);
  return supervisorId != null ? directory.get(supervisorId) ?? null : null;
}

/** Active admins (founder included), minus the given ids. */
export function activeAdminIds(directory: Map<number, DirectoryUser>, exclude: number[] = []): number[] {
  const skip = new Set(exclude);
  return [...directory.values()]
    .filter(u => u.isActive && normalizeRole(u.role) === 'admin' && !skip.has(u.id))
    .map(u => u.id);
}

/**
 * True when at least one active user has this user as their main lead. Drives
 * who sees Time Approvals (admins always do). Only main lines count, since
 * only the main lead approves.
 */
export async function hasDirectReports(userId: number, admin: Admin = createAdminClient()): Promise<boolean> {
  const { data: rows, error } = await admin
    .from('user_reporting')
    .select('user_id')
    .eq('reports_to_user_id', userId);
  if (error) return false;
  const ids = ((rows ?? []) as { user_id: number }[]).map(r => r.user_id);
  if (!ids.length) return false;
  const { count } = await admin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .in('id', ids)
    .eq('is_active', 1);
  return (count ?? 0) > 0;
}

/** Manila-style date label, e.g. "Fri, Oct 9". */
export function fmtDateLabel(date: string): string {
  const d = new Date(date + 'T00:00:00');
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
}
