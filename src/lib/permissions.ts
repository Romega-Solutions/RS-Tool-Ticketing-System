// Server-only permission helpers for the internal PM features.
// Used by /api/tickets/* routes. See docs/INTERNAL_PM_BUILD_PLAN.md § 7.

import { createAdminClient } from '@/lib/supabase/admin';
import type { SessionUser } from '@/lib/session';

async function isProjectMember(userId: number, projectId: number): Promise<boolean> {
  const sb = createAdminClient();
  const { data } = await sb
    .from('project_members')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

/**
 * View / read access. Admin and lead see everything; members see their own
 * projects. If the project has zero recorded members we fail open (legacy
 * projects from before the project_members table existed).
 */
export async function canViewProject(user: SessionUser, projectId: number): Promise<boolean> {
  if (user.role === 'admin' || user.role === 'lead') return true;
  if (await isProjectMember(user.id, projectId)) return true;

  const sb = createAdminClient();
  const { count } = await sb
    .from('project_members')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);
  return (count ?? 0) === 0;
}

/**
 * Project-level admin actions: create/rename states, manage labels, add/remove
 * members, archive project. Leads and admins only.
 */
export function canManageProject(user: SessionUser): boolean {
  return user.role === 'admin' || user.role === 'lead';
}

/**
 * Comments — § 10 Q2: any project member can comment. Admin/lead always.
 */
export async function canCommentOnProject(user: SessionUser, projectId: number): Promise<boolean> {
  return canViewProject(user, projectId);
}

/**
 * Edit a work item: admin/lead any item; ICs may edit only items they are
 * assigned to, or items in projects where they are listed as `role='lead'`.
 */
export async function canEditWorkItem(
  user: SessionUser,
  workItem: { id: number | string; projectId: number },
): Promise<boolean> {
  if (user.role === 'admin' || user.role === 'lead') return true;

  const sb = createAdminClient();

  const { data: pm } = await sb
    .from('project_members')
    .select('role')
    .eq('project_id', workItem.projectId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (pm?.role === 'lead') return true;

  const { data: assignee } = await sb
    .from('work_item_assignees')
    .select('id')
    .eq('work_item_id', Number(workItem.id))
    .eq('user_id', user.id)
    .maybeSingle();
  return !!assignee;
}

/** Delete = archive. Admin only (§ 7). */
export function canArchiveWorkItem(user: SessionUser): boolean {
  return user.role === 'admin';
}

/** Anyone authenticated can create a project (auto-tagged to their team). */
export function canCreateProject(user: SessionUser): boolean {
  return !!user;
}

/** Anyone authenticated can edit basic project fields (name, description). */
export function canEditProject(user: SessionUser): boolean {
  return !!user;
}

/** Re-teaming (moving a project to a different team) is a lead/admin action. */
export function canReteamProject(user: SessionUser): boolean {
  return user.role === 'admin' || user.role === 'lead';
}

/** Archiving / deleting a project: lead or admin only. */
export function canArchiveProject(user: SessionUser): boolean {
  return user.role === 'admin' || user.role === 'lead';
}
