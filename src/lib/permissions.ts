// Server-only permission helpers for the internal PM features.
// Used by /api/tickets/* routes and the project pages.
//
// Access is governed by a per-project role (project_members.role):
//   viewer → view + comment/@mention only
//   member → viewer + create/edit items (NOT due date, NOT assignees) ; no settings
//   lead   → member + due date + assignees + project settings (everything)
// Global ADMINS bypass and are always treated as project leads. Everyone else
// (including org/team leads) is governed by their stored project role.

import { createAdminClient } from '@/lib/supabase/admin';
import type { SessionUser } from '@/lib/session';

export type ProjectRole = 'lead' | 'member' | 'viewer';

export interface ProjectCaps {
  canView: boolean;
  canComment: boolean;       // post comments + @mention members
  canCreateItem: boolean;    // create work items
  canEditItem: boolean;      // title, description, state (kanban move), priority, cycle, labels, parent
  canEditDates: boolean;     // target_date (due date)
  canEditAssignees: boolean; // work_item_assignees
  canArchiveItem: boolean;   // soft-delete a work item
  canManage: boolean;        // project settings: rename, states, labels, cycles, members, archive, re-team
}

const NONE: ProjectCaps = {
  canView: false, canComment: false, canCreateItem: false, canEditItem: false,
  canEditDates: false, canEditAssignees: false, canArchiveItem: false, canManage: false,
};

/**
 * Pure capability matrix — the single source of truth for what each project
 * role can do. Global admins are resolved to 'lead' before reaching here.
 */
export function projectCaps(role: ProjectRole | null): ProjectCaps {
  switch (role) {
    case 'lead':
      return { canView: true, canComment: true, canCreateItem: true, canEditItem: true,
               canEditDates: true, canEditAssignees: true, canArchiveItem: true, canManage: true };
    case 'member':
      return { canView: true, canComment: true, canCreateItem: true, canEditItem: true,
               canEditDates: false, canEditAssignees: false, canArchiveItem: false, canManage: false };
    case 'viewer':
      return { canView: true, canComment: true, canCreateItem: false, canEditItem: false,
               canEditDates: false, canEditAssignees: false, canArchiveItem: false, canManage: false };
    default:
      return NONE;
  }
}

/** Coerce a stored role string to a known ProjectRole (unknown → 'member'). */
export function normalizeProjectRole(role: unknown): ProjectRole {
  const v = String(role ?? '').trim().toLowerCase();
  return v === 'lead' || v === 'viewer' ? v : 'member';
}

/**
 * Effective project role for a user. Global admins bypass (always 'lead').
 * Everyone else is governed by their project_members.role. A non-member on a
 * project that HAS members gets null (no access). Legacy projects with zero
 * recorded members fail open to 'lead' (pre-membership behaviour).
 */
export async function getProjectRole(user: SessionUser, projectId: number | string): Promise<ProjectRole | null> {
  if (user.role === 'admin') return 'lead';
  const sb = createAdminClient();
  const pid = Number(projectId);
  const { data: pm } = await sb
    .from('project_members').select('role')
    .eq('project_id', pid).eq('user_id', user.id).maybeSingle();
  if (pm) return normalizeProjectRole(pm.role);

  const { count } = await sb
    .from('project_members').select('id', { count: 'exact', head: true }).eq('project_id', pid);
  return (count ?? 0) === 0 ? 'lead' : null;   // legacy fail-open
}

/** Resolve the full capability set for a user on a project in one call. */
export async function getProjectCaps(user: SessionUser, projectId: number | string): Promise<ProjectCaps> {
  return projectCaps(await getProjectRole(user, projectId));
}

// ── Convenience wrappers (project-role aware) ────────────────────────────────

export async function canViewProject(user: SessionUser, projectId: number): Promise<boolean> {
  return (await getProjectCaps(user, projectId)).canView;
}
export async function canCommentOnProject(user: SessionUser, projectId: number): Promise<boolean> {
  return (await getProjectCaps(user, projectId)).canComment;
}
export async function canCreateWorkItem(user: SessionUser, projectId: number): Promise<boolean> {
  return (await getProjectCaps(user, projectId)).canCreateItem;
}
export async function canEditWorkItem(
  user: SessionUser,
  workItem: { id: number | string; projectId: number },
): Promise<boolean> {
  return (await getProjectCaps(user, workItem.projectId)).canEditItem;
}
export async function canArchiveWorkItem(user: SessionUser, projectId: number): Promise<boolean> {
  return (await getProjectCaps(user, projectId)).canArchiveItem;
}

/** Project settings (members, labels, cycles, states, archive). Project lead / admin. */
export async function canManageProject(user: SessionUser, projectId: number): Promise<boolean> {
  return (await getProjectCaps(user, projectId)).canManage;
}
/** Editing a project's own fields (name/description) is a settings action. */
export async function canEditProject(user: SessionUser, projectId: number): Promise<boolean> {
  return (await getProjectCaps(user, projectId)).canManage;
}
/** Re-teaming a project. Project lead / admin. */
export async function canReteamProject(user: SessionUser, projectId: number): Promise<boolean> {
  return (await getProjectCaps(user, projectId)).canManage;
}
/** Archiving / deleting a project. Project lead / admin. */
export async function canArchiveProject(user: SessionUser, projectId: number): Promise<boolean> {
  return (await getProjectCaps(user, projectId)).canManage;
}

/** Anyone authenticated can create a project (auto-tagged to their team). */
export function canCreateProject(user: SessionUser): boolean {
  return !!user;
}
