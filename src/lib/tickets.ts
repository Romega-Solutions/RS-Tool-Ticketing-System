// Server-only — never import this in client components ('use client').
// Internal ticketing library, backed by Supabase. Type names that still start
// with `Plane*` exist for back-compat with callers that haven't been
// renamed yet; they no longer have anything to do with Plane.so.
import { createAdminClient } from '@/lib/supabase/admin';
import { mapOrgDeptToAppTeam } from '@/lib/orgchart';

export interface PlaneProject {
  id: string;
  name: string;
  identifier: string;
  description: string;
  network: number;
  team: string | null;
  autoArchiveDoneDays: number | null;   // null/0 = off
}

export interface PlaneState {
  id: string;
  name: string;
  group: string;
  color: string;
  sequence: number;
}

export interface PlaneMember {
  id: string;
  display_name: string;
  email: string;
  avatar?: string;
}

export interface PlaneWorkItem {
  id: string;
  sequence_id: number;
  name: string;
  description_stripped?: string;
  state: string;
  state_detail?: { id: string; name: string; group: string; color: string };
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  assignees: string[];
  assignee_ids?: string[];
  target_date?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  label_detail?: Array<{ id: string; name: string; color: string }>;
  labels?: string[];
  label_ids?: number[];
  cycle_id?: number | null;
}

// Kept for signature compatibility with callers that catch PlaneApiError.
export class PlaneApiError extends Error {
  constructor(public readonly status: number, path: string) {
    super(`Tickets DB ${status}: ${path}`);
  }
}

export type ProjectPatch = {
  name?: string;
  description?: string | null;
  team?: string | null;
  archived?: number;
  autoArchiveDoneDays?: number | null;   // null/0 = off
};

type Row = Record<string, unknown>;

function mapProject(r: Row): PlaneProject {
  return {
    id: String(r.id),
    name: String(r.name),
    identifier: String(r.identifier ?? ''),
    description: String(r.description ?? ''),
    network: Number(r.network ?? 2),
    team: r.team ? String(r.team) : null,
    autoArchiveDoneDays: r.auto_archive_done_days == null ? null : Number(r.auto_archive_done_days),
  };
}

export function normalizeProjectPatch(patch: ProjectPatch): ProjectPatch {
  const normalized: ProjectPatch = {};

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error('Project name cannot be blank');
    normalized.name = name;
  }

  if (patch.description !== undefined) {
    const description = patch.description?.trim() ?? '';
    normalized.description = description || null;
  }

  if (patch.team !== undefined) {
    const team = patch.team?.trim() ?? '';
    normalized.team = team || null;
  }

  if (patch.archived !== undefined) {
    normalized.archived = patch.archived;
  }

  if (patch.autoArchiveDoneDays !== undefined) {
    // Clamp to a sane range; null or <=0 means "off".
    const d = patch.autoArchiveDoneDays;
    normalized.autoArchiveDoneDays =
      d == null || d <= 0 ? null : Math.min(Math.floor(d), 365);
  }

  return normalized;
}

function mapState(r: Row): PlaneState {
  return {
    id: String(r.id),
    name: String(r.name),
    group: String(r.group),
    color: String(r.color ?? '#6b7280'),
    sequence: Number(r.sequence ?? 0),
  };
}

export async function getProjects(opts?: { team?: string | null }): Promise<PlaneProject[]> {
  const sb = createAdminClient();
  let q = sb.from('projects')
    .select('id, name, identifier, description, network, team, auto_archive_done_days')
    .eq('archived', 0)
    .order('name');
  // Empty string or `null` is treated as "no filter".
  if (opts?.team) q = q.eq('team', opts.team);
  const { data, error } = await q;
  if (error) throw new PlaneApiError(500, 'projects');
  return (data ?? []).map(mapProject);
}

// Lightweight name lookup used for notification copy ("…tagged you in {name}").
export async function getProjectName(projectId: number | string): Promise<string> {
  const sb = createAdminClient();
  const { data } = await sb.from('projects')
    .select('name').eq('id', Number(projectId)).maybeSingle();
  return String((data as Row | null)?.name ?? 'a project');
}

export async function getProjectStates(projectId: string): Promise<PlaneState[]> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from('project_states')
    .select('id, name, group, color, sequence')
    .eq('project_id', Number(projectId))
    .order('sequence');
  if (error) throw new PlaneApiError(500, `states/${projectId}`);
  return (data ?? []).map(mapState);
}

export async function getWorkspaceMembers(): Promise<PlaneMember[]> {
  const sb = createAdminClient();
  // `id` is the integer users.id stringified. The legacy plane_member_id
  // column is gone — user_id is the canonical assignee key now.
  const { data, error } = await sb
    .from('users')
    .select('id, name, email')
    .eq('is_active', 1);
  if (error) throw new PlaneApiError(500, 'members');
  return (data ?? []).map((u: Row) => ({
    id: String(u.id),
    display_name: String(u.name),
    email: String(u.email ?? ''),
  }));
}

export async function getWorkItems(
  projectId: string,
  params?: Record<string, string>,
): Promise<PlaneWorkItem[]> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from('work_items')
    .select('id, sequence_id, name, description, priority, state_id, cycle_id, target_date, completed_at, created_at, updated_at, work_item_assignees(user_id, users(email)), work_item_labels(label_id)')
    .eq('project_id', Number(projectId))
    .eq('archived', 0)
    // Newest task first (highest sequence_id) — board columns and My Tasks read
    // this order top-to-bottom, so descending puts the latest work at the top.
    .order('sequence_id', { ascending: false });

  if (error) throw new PlaneApiError(500, `work-items/${projectId}`);

  let items: PlaneWorkItem[] = (data ?? []).map((r: Row) => {
    // `assignees` is now an array of user emails (the kanban filter + "Mine
    // only" toggle key off email). `assignee_ids` keeps numeric user ids
    // as strings so API filters can take either.
    const aRows = (r.work_item_assignees as Row[] | null) ?? [];
    const assignees: string[] = aRows
      .map(a => String((a.users as Row | null)?.email ?? ''))
      .filter(Boolean);
    const assigneeIds: string[] = aRows
      .map(a => a.user_id != null ? String(a.user_id) : '')
      .filter(Boolean);
    const labelIds = ((r.work_item_labels as Row[] | null) ?? [])
      .map(l => Number(l.label_id));
    return {
      id: String(r.id),
      sequence_id: Number(r.sequence_id ?? 0),
      name: String(r.name),
      description_stripped: r.description ? String(r.description) : undefined,
      state: r.state_id != null ? String(r.state_id) : '',
      priority: (String(r.priority ?? 'none')) as PlaneWorkItem['priority'],
      assignees,
      assignee_ids: assigneeIds,
      label_ids: labelIds,
      cycle_id: r.cycle_id != null ? Number(r.cycle_id) : null,
      target_date: (r.target_date as string | null) ?? null,
      completed_at: (r.completed_at as string | null) ?? null,
      created_at: String(r.created_at ?? ''),
      updated_at: String(r.updated_at ?? ''),
    };
  });

  // Client-side assignee filter. Accepts either a user_id (numeric) or an
  // email — whichever is more convenient at the call-site.
  const assignee = params?.assignee;
  if (assignee) {
    items = items.filter(i =>
      i.assignees.includes(assignee) ||
      (i.assignee_ids?.includes(assignee) ?? false),
    );
  }
  return items;
}

// ── Phase 1 additions ─────────────────────────────────────────────────────

export interface WorkItemDetail extends Omit<PlaneWorkItem, 'labels'> {
  project_id: number;
  description: string | null;
  cycle_id: number | null;
  parent_id: number | null;
  labels: Array<{ id: number; name: string; color: string }>;
  assignee_users: Array<{ id: number; name: string; email: string }>;
}

export async function getWorkItemDetail(itemId: string): Promise<WorkItemDetail | null> {
  const sb = createAdminClient();
  const id = Number(itemId);

  const { data: wi, error } = await sb
    .from('work_items')
    .select('id, project_id, sequence_id, name, description, priority, state_id, cycle_id, parent_id, target_date, completed_at, created_at, updated_at, archived, work_item_assignees(user_id, users(id, name, email)), work_item_labels(label_id, labels(id, name, color))')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new PlaneApiError(500, `work-items/${itemId}`);
  if (!wi || (wi as Row).archived === 1) return null;

  const r = wi as Row;
  const assigneeRows = (r.work_item_assignees as Row[] | null) ?? [];
  const labelRows    = (r.work_item_labels as Row[] | null) ?? [];

  const assigneeUsers = assigneeRows
    .map(a => (a.users as Row | null))
    .filter((u): u is Row => !!u)
    .map(u => ({
      id: Number(u.id),
      name: String(u.name ?? ''),
      email: String(u.email ?? ''),
    }));
  // `assignees` mirrors getWorkItems: emails for UI filter parity.
  const assigneeEmails = assigneeUsers.map(u => u.email).filter(Boolean);
  const assigneeIds    = assigneeUsers.map(u => String(u.id));
  const labels = labelRows
    .map(l => l.labels as Row | null)
    .filter((l): l is Row => !!l)
    .map(l => ({ id: Number(l.id), name: String(l.name), color: String(l.color) }));

  return {
    id: String(r.id),
    project_id: Number(r.project_id),
    sequence_id: Number(r.sequence_id ?? 0),
    name: String(r.name),
    description: (r.description as string | null) ?? null,
    description_stripped: r.description ? String(r.description) : undefined,
    state: r.state_id != null ? String(r.state_id) : '',
    priority: (String(r.priority ?? 'none')) as PlaneWorkItem['priority'],
    cycle_id: r.cycle_id != null ? Number(r.cycle_id) : null,
    parent_id: r.parent_id != null ? Number(r.parent_id) : null,
    assignees: assigneeEmails,
    assignee_ids: assigneeIds,
    assignee_users: assigneeUsers,
    labels,
    target_date: (r.target_date as string | null) ?? null,
    completed_at: (r.completed_at as string | null) ?? null,
    created_at: String(r.created_at ?? ''),
    updated_at: String(r.updated_at ?? ''),
  };
}

export interface WorkItemPatch {
  state?: string;
  priority?: string;
  name?: string;
  description?: string | null;
  target_date?: string | null;
  cycle_id?: number | null;
  parent_id?: number | null;
  /** Replace the assignee list with exactly these user ids. */
  assigneeUserIds?: number[];
}

export async function patchWorkItem(
  itemId: string,
  patch: WorkItemPatch,
): Promise<{ projectId: number; before: WorkItemDetail | null }> {
  const sb = createAdminClient();
  const id = Number(itemId);

  const before = await getWorkItemDetail(itemId);
  if (!before) throw new PlaneApiError(404, `work-items/${itemId}`);

  const update: Row = { updated_at: new Date().toISOString() };
  if (patch.state !== undefined)       update.state_id    = Number(patch.state);
  if (patch.priority !== undefined)    update.priority    = patch.priority;
  if (patch.name !== undefined)        update.name        = patch.name;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.target_date !== undefined) update.target_date = patch.target_date;
  if (patch.cycle_id !== undefined)    update.cycle_id    = patch.cycle_id;
  if (patch.parent_id !== undefined)   update.parent_id   = patch.parent_id;

  if (patch.state !== undefined) {
    const { data: st } = await sb.from('project_states')
      .select('group').eq('id', Number(patch.state)).maybeSingle();
    if (st) {
      update.completed_at = String(st.group) === 'completed' ? new Date().toISOString() : null;
    }
  }

  if (Object.keys(update).length > 1) {
    const { error } = await sb.from('work_items').update(update).eq('id', id);
    if (error) throw new PlaneApiError(502, `work-items/${itemId}`);
  }

  if (patch.assigneeUserIds) {
    // Replace strategy: delete all, insert the new set. user_id is the only
    // assignee key now — member_key was dropped with the plane_member_id removal.
    await sb.from('work_item_assignees').delete().eq('work_item_id', id);
    if (patch.assigneeUserIds.length > 0) {
      const rows = patch.assigneeUserIds.map(uid => ({
        work_item_id: id,
        user_id: uid,
      }));
      const { error } = await sb.from('work_item_assignees').insert(rows);
      if (error) throw new PlaneApiError(502, `work-item-assignees/${itemId}`);
    }
  }

  return { projectId: before.project_id, before };
}

export async function archiveWorkItem(itemId: string): Promise<number> {
  const sb = createAdminClient();
  const id = Number(itemId);
  const nowIso = new Date().toISOString();
  const { data: before } = await sb.from('work_items')
    .select('project_id').eq('id', id).maybeSingle();
  if (!before) throw new PlaneApiError(404, `work-items/${itemId}`);
  const { error } = await sb.from('work_items')
    .update({ archived: 1, archived_at: nowIso, updated_at: nowIso })
    .eq('id', id);
  if (error) throw new PlaneApiError(502, `work-items/${itemId} archive`);
  return Number((before as Row).project_id);
}

// Un-archive a task: it reappears in its state column on the board.
export async function restoreWorkItem(itemId: string): Promise<number> {
  const sb = createAdminClient();
  const id = Number(itemId);
  const { data: before } = await sb.from('work_items')
    .select('project_id').eq('id', id).maybeSingle();
  if (!before) throw new PlaneApiError(404, `work-items/${itemId}`);
  const { error } = await sb.from('work_items')
    .update({ archived: 0, archived_at: null, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new PlaneApiError(502, `work-items/${itemId} restore`);
  return Number((before as Row).project_id);
}

// State ids belonging to the project's "completed" (Done) group.
async function getCompletedStateIds(projectId: string): Promise<number[]> {
  const states = await getProjectStates(projectId);
  return states
    .filter(s => isCompletedGroup(s.group.toLowerCase()))
    .map(s => Number(s.id));
}

// Manual bulk archive: clear every (non-archived) Done task in one project.
// Returns the archived item ids so the board can drop them optimistically.
export async function bulkArchiveCompleted(
  projectId: string,
  actorId: number,
): Promise<{ count: number; ids: number[] }> {
  const sb = createAdminClient();
  const doneStateIds = await getCompletedStateIds(projectId);
  if (!doneStateIds.length) return { count: 0, ids: [] };

  const { data, error } = await sb.from('work_items')
    .select('id')
    .eq('project_id', Number(projectId))
    .eq('archived', 0)
    .in('state_id', doneStateIds);
  if (error) throw new PlaneApiError(500, `work-items/${projectId} done`);

  const ids = (data ?? []).map((r: Row) => Number(r.id));
  if (!ids.length) return { count: 0, ids: [] };

  const nowIso = new Date().toISOString();
  const { error: upErr } = await sb.from('work_items')
    .update({ archived: 1, archived_at: nowIso, updated_at: nowIso })
    .in('id', ids);
  if (upErr) throw new PlaneApiError(502, `work-items/${projectId} bulk archive`);

  await Promise.all(ids.map(id => logActivity(id, actorId, 'archived')));
  return { count: ids.length, ids };
}

export interface ArchivedWorkItem {
  id: string;
  sequence_id: number;
  name: string;
  priority: string;
  state_name: string;
  archived_at: string | null;
}

// The project Archive view: archived tasks, most-recently-archived first.
export async function getArchivedWorkItems(projectId: string): Promise<ArchivedWorkItem[]> {
  const sb = createAdminClient();
  const { data, error } = await sb.from('work_items')
    .select('id, sequence_id, name, priority, archived_at, project_states(name)')
    .eq('project_id', Number(projectId))
    .eq('archived', 1)
    .order('archived_at', { ascending: false, nullsFirst: false });
  if (error) throw new PlaneApiError(500, `archived/${projectId}`);
  return (data ?? []).map((r: Row) => ({
    id: String(r.id),
    sequence_id: Number(r.sequence_id ?? 0),
    name: String(r.name),
    priority: String(r.priority ?? 'none'),
    state_name: String((r.project_states as Row | null)?.name ?? ''),
    archived_at: (r.archived_at as string | null) ?? null,
  }));
}

// Daily cron sweep: archive Done tasks whose completion is older than each
// project's configured window (projects.auto_archive_done_days; null/0 = off).
export async function autoArchiveCompletedTasks(): Promise<{ archived: number; projects: number }> {
  const sb = createAdminClient();
  const { data: projs, error } = await sb.from('projects')
    .select('id, auto_archive_done_days')
    .eq('archived', 0);
  if (error) throw new PlaneApiError(500, 'projects auto-archive');

  let archived = 0;
  let touched = 0;
  for (const p of (projs ?? []) as Row[]) {
    const days = Number(p.auto_archive_done_days ?? 0);
    if (!days || days <= 0) continue;

    const doneStateIds = await getCompletedStateIds(String(p.id));
    if (!doneStateIds.length) continue;

    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data: items } = await sb.from('work_items')
      .select('id')
      .eq('project_id', Number(p.id))
      .eq('archived', 0)
      .in('state_id', doneStateIds)
      .not('completed_at', 'is', null)
      .lt('completed_at', cutoff);

    const ids = (items ?? []).map((r: Row) => Number(r.id));
    if (!ids.length) continue;

    const nowIso = new Date().toISOString();
    await sb.from('work_items')
      .update({ archived: 1, archived_at: nowIso, updated_at: nowIso })
      .in('id', ids);
    archived += ids.length;
    touched += 1;
  }
  return { archived, projects: touched };
}

// ── Comments ────────────────────────────────────────────────────────────

export interface WorkItemComment {
  id: number;
  work_item_id: number;
  author_id: number;
  author_name: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export async function getComments(itemId: string): Promise<WorkItemComment[]> {
  const sb = createAdminClient();
  const { data, error } = await sb.from('work_item_comments')
    .select('id, work_item_id, author_id, body, created_at, updated_at, users(name)')
    .eq('work_item_id', Number(itemId))
    .order('created_at');
  if (error) throw new PlaneApiError(500, `comments/${itemId}`);
  return (data ?? []).map((r: Row) => ({
    id: Number(r.id),
    work_item_id: Number(r.work_item_id),
    author_id: Number(r.author_id),
    author_name: String((r.users as Row | null)?.name ?? 'Unknown'),
    body: String(r.body),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  }));
}

export async function createComment(itemId: string, authorId: number, body: string): Promise<WorkItemComment> {
  const sb = createAdminClient();
  const { data, error } = await sb.from('work_item_comments').insert({
    work_item_id: Number(itemId),
    author_id: authorId,
    body,
  }).select('id').single();
  if (error || !data) throw new PlaneApiError(502, `comments create`);
  const all = await getComments(itemId);
  const found = all.find(c => c.id === Number(data.id));
  if (!found) throw new PlaneApiError(502, `comments readback`);
  return found;
}

export async function updateComment(commentId: string, body: string): Promise<void> {
  const sb = createAdminClient();
  const { error } = await sb.from('work_item_comments')
    .update({ body, updated_at: new Date().toISOString() })
    .eq('id', Number(commentId));
  if (error) throw new PlaneApiError(502, `comments/${commentId}`);
}

export async function deleteComment(commentId: string): Promise<void> {
  const sb = createAdminClient();
  const { error } = await sb.from('work_item_comments').delete().eq('id', Number(commentId));
  if (error) throw new PlaneApiError(502, `comments/${commentId}`);
}

export async function getComment(commentId: string): Promise<{ id: number; author_id: number; work_item_id: number } | null> {
  const sb = createAdminClient();
  const { data } = await sb.from('work_item_comments')
    .select('id, author_id, work_item_id').eq('id', Number(commentId)).maybeSingle();
  if (!data) return null;
  return { id: Number(data.id), author_id: Number(data.author_id), work_item_id: Number(data.work_item_id) };
}

// ── Labels ──────────────────────────────────────────────────────────────

export interface Label {
  id: number;
  project_id: number;
  name: string;
  color: string;
}

export async function getLabels(projectId: string): Promise<Label[]> {
  const sb = createAdminClient();
  const { data, error } = await sb.from('labels')
    .select('id, project_id, name, color')
    .eq('project_id', Number(projectId))
    .order('name');
  if (error) throw new PlaneApiError(500, `labels/${projectId}`);
  return (data ?? []).map((r: Row) => ({
    id: Number(r.id), project_id: Number(r.project_id),
    name: String(r.name), color: String(r.color),
  }));
}

export async function createLabel(projectId: string, name: string, color: string): Promise<Label> {
  const sb = createAdminClient();
  const { data, error } = await sb.from('labels').insert({
    project_id: Number(projectId), name, color,
  }).select('id, project_id, name, color').single();
  if (error || !data) throw new PlaneApiError(502, `labels create`);
  return {
    id: Number(data.id), project_id: Number(data.project_id),
    name: String(data.name), color: String(data.color),
  };
}

export async function deleteLabel(labelId: string): Promise<void> {
  const sb = createAdminClient();
  const { error } = await sb.from('labels').delete().eq('id', Number(labelId));
  if (error) throw new PlaneApiError(502, `labels/${labelId}`);
}

// ── Project members ─────────────────────────────────────────────────────

export interface ProjectMember {
  id: number;
  project_id: number;
  user_id: number;
  name: string;
  email: string;
  role: string;
}

export async function getProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const sb = createAdminClient();
  const { data, error } = await sb.from('project_members')
    .select('id, project_id, user_id, role, users(name, email)')
    .eq('project_id', Number(projectId));
  if (error) throw new PlaneApiError(500, `project-members/${projectId}`);
  return (data ?? []).map((r: Row) => ({
    id: Number(r.id),
    project_id: Number(r.project_id),
    user_id: Number(r.user_id),
    role: String(r.role),
    name: String((r.users as Row | null)?.name ?? ''),
    email: String((r.users as Row | null)?.email ?? ''),
  }));
}

export async function addProjectMember(projectId: string, userId: number, role = 'member'): Promise<void> {
  const sb = createAdminClient();
  const { error } = await sb.from('project_members')
    .upsert({ project_id: Number(projectId), user_id: userId, role }, { onConflict: 'project_id,user_id' });
  if (error) throw new PlaneApiError(502, `project-members/${projectId} add`);
}

export async function removeProjectMember(projectId: string, userId: number): Promise<void> {
  const sb = createAdminClient();
  const { error } = await sb.from('project_members')
    .delete().eq('project_id', Number(projectId)).eq('user_id', userId);
  if (error) throw new PlaneApiError(502, `project-members/${projectId}/${userId}`);
}

// ── Activity log ────────────────────────────────────────────────────────

export interface WorkItemActivityEntry {
  id: number;
  actor_id: number;
  actor_name: string;
  action: string;
  from_value: string | null;
  to_value: string | null;
  created_at: string;
}

export interface DashboardActivityEntry extends WorkItemActivityEntry {
  work_item_id: number;
  task_sequence_id: number;
  task_name: string;
  project_id: number;
  project_identifier: string;
  project_name: string;
  from_state_name: string | null;
  to_state_name: string | null;
}

export async function logActivity(
  workItemId: number,
  actorId: number,
  action: string,
  fromValue?: string | null,
  toValue?: string | null,
): Promise<void> {
  const sb = createAdminClient();
  await sb.from('work_item_activity').insert({
    work_item_id: workItemId,
    actor_id: actorId,
    action,
    from_value: fromValue ?? null,
    to_value:   toValue ?? null,
  });
}

export async function getActivity(itemId: string): Promise<WorkItemActivityEntry[]> {
  const sb = createAdminClient();
  const { data, error } = await sb.from('work_item_activity')
    .select('id, actor_id, action, from_value, to_value, created_at, users(name)')
    .eq('work_item_id', Number(itemId))
    .order('created_at', { ascending: false });
  if (error) throw new PlaneApiError(500, `activity/${itemId}`);
  return (data ?? []).map((r: Row) => ({
    id: Number(r.id),
    actor_id: Number(r.actor_id),
    actor_name: String((r.users as Row | null)?.name ?? 'Unknown'),
    action: String(r.action),
    from_value: (r.from_value as string | null) ?? null,
    to_value:   (r.to_value as string | null) ?? null,
    created_at: String(r.created_at),
  }));
}

function firstNestedRow(value: unknown): Row | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === 'object' ? first as Row : null;
  }
  return value && typeof value === 'object' ? value as Row : null;
}

function normalizeActivityLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 8;
  return Math.min(Math.max(Math.trunc(limit), 1), 20);
}

function collectStateIds(rows: Row[]): number[] {
  const ids = new Set<number>();
  for (const row of rows) {
    if (String(row.action) !== 'state_changed') continue;
    for (const key of ['from_value', 'to_value']) {
      const value = row[key];
      if (typeof value !== 'string' || value.trim() === '') continue;
      const id = Number(value);
      if (Number.isFinite(id)) ids.add(id);
    }
  }
  return [...ids];
}

function mapDashboardActivityRow(
  row: Row,
  stateNames: Map<string, string>,
): DashboardActivityEntry | null {
  const workItem = firstNestedRow(row.work_items);
  if (!workItem || Number(workItem.archived ?? 0) === 1) return null;

  const project = firstNestedRow(workItem.projects);
  if (!project || Number(project.archived ?? 0) === 1) return null;

  const actor = firstNestedRow(row.users);
  const fromValue = (row.from_value as string | null) ?? null;
  const toValue = (row.to_value as string | null) ?? null;

  return {
    id: Number(row.id),
    actor_id: Number(row.actor_id),
    actor_name: String(actor?.name ?? 'Unknown'),
    action: String(row.action),
    from_value: fromValue,
    to_value: toValue,
    created_at: String(row.created_at),
    work_item_id: Number(row.work_item_id),
    task_sequence_id: Number(workItem.sequence_id ?? 0),
    task_name: String(workItem.name ?? ''),
    project_id: Number(workItem.project_id),
    project_identifier: String(project.identifier ?? ''),
    project_name: String(project.name ?? ''),
    from_state_name: fromValue ? stateNames.get(fromValue) ?? null : null,
    to_state_name: toValue ? stateNames.get(toValue) ?? null : null,
  };
}

export function describeDashboardActivity(a: DashboardActivityEntry): string {
  const taskRef = `${a.project_identifier}-${a.task_sequence_id}`;
  const taskLabel = `${taskRef} ${a.task_name}`.trim();

  switch (a.action) {
    case 'created':
      return `created ${taskLabel}`;
    case 'state_changed':
      return `moved ${taskLabel} from ${a.from_state_name ?? a.from_value ?? 'No state'} to ${a.to_state_name ?? a.to_value ?? 'No state'}`;
    default:
      return a.action;
  }
}

export async function getDashboardProjectActivity(limit = 8): Promise<DashboardActivityEntry[]> {
  const sb = createAdminClient();
  const cappedLimit = normalizeActivityLimit(limit);

  const { data, error } = await sb.from('work_item_activity')
    .select('id, work_item_id, actor_id, action, from_value, to_value, created_at, users(name), work_items!inner(id, project_id, sequence_id, name, archived, projects(id, name, identifier, archived))')
    .in('action', ['created', 'state_changed'])
    .order('created_at', { ascending: false })
    .limit(cappedLimit * 3);
  if (error) throw new PlaneApiError(500, 'dashboard-activity');

  const rows = (data ?? []) as Row[];
  const stateIds = collectStateIds(rows);
  const stateNames = new Map<string, string>();

  if (stateIds.length > 0) {
    const { data: states, error: statesError } = await sb.from('project_states')
      .select('id, name')
      .in('id', stateIds);
    if (statesError) throw new PlaneApiError(500, 'dashboard-activity/states');
    for (const state of (states ?? []) as Row[]) {
      stateNames.set(String(state.id), String(state.name));
    }
  }

  return rows
    .map(row => mapDashboardActivityRow(row, stateNames))
    .filter((entry): entry is DashboardActivityEntry => entry !== null)
    .slice(0, cappedLimit);
}

/** Diff a WorkItemPatch against the prior detail, returning activity rows to log. */
export function diffActivity(
  before: WorkItemDetail,
  patch: WorkItemPatch,
): Array<{ action: string; from: string | null; to: string | null }> {
  const out: Array<{ action: string; from: string | null; to: string | null }> = [];
  if (patch.state !== undefined && patch.state !== before.state) {
    out.push({ action: 'state_changed', from: before.state || null, to: patch.state });
  }
  if (patch.priority !== undefined && patch.priority !== before.priority) {
    out.push({ action: 'edited', from: `priority:${before.priority}`, to: `priority:${patch.priority}` });
  }
  if (patch.name !== undefined && patch.name !== before.name) {
    out.push({ action: 'edited', from: `name:${before.name}`, to: `name:${patch.name}` });
  }
  if (patch.target_date !== undefined && patch.target_date !== before.target_date) {
    out.push({ action: 'edited', from: `target_date:${before.target_date ?? ''}`, to: `target_date:${patch.target_date ?? ''}` });
  }
  if (patch.description !== undefined && (patch.description ?? '') !== (before.description ?? '')) {
    out.push({ action: 'edited', from: 'description', to: 'description' });
  }
  if (patch.cycle_id !== undefined && patch.cycle_id !== before.cycle_id) {
    out.push({ action: 'edited', from: `cycle:${before.cycle_id ?? ''}`, to: `cycle:${patch.cycle_id ?? ''}` });
  }
  if (patch.parent_id !== undefined && patch.parent_id !== before.parent_id) {
    out.push({ action: 'edited', from: `parent:${before.parent_id ?? ''}`, to: `parent:${patch.parent_id ?? ''}` });
  }
  if (patch.assigneeUserIds) {
    const beforeIds = new Set(before.assignee_users.map(u => u.id));
    const afterIds  = new Set(patch.assigneeUserIds);
    for (const id of afterIds) if (!beforeIds.has(id)) out.push({ action: 'assigned', from: null, to: String(id) });
    for (const id of beforeIds) if (!afterIds.has(id)) out.push({ action: 'unassigned', from: String(id), to: null });
  }
  return out;
}

// ── Cycles (Phase 3) ───────────────────────────────────────────────────

export interface Cycle {
  id: number;
  project_id: number;
  name: string;
  start_date: string;
  end_date: string;
  archived: number;
}

export async function getCycles(projectId: string): Promise<Cycle[]> {
  const sb = createAdminClient();
  const { data, error } = await sb.from('cycles')
    .select('id, project_id, name, start_date, end_date, archived')
    .eq('project_id', Number(projectId))
    .eq('archived', 0)
    .order('start_date', { ascending: false });
  if (error) throw new PlaneApiError(500, `cycles/${projectId}`);
  return (data ?? []).map((r: Row) => ({
    id: Number(r.id), project_id: Number(r.project_id),
    name: String(r.name), start_date: String(r.start_date),
    end_date: String(r.end_date), archived: Number(r.archived ?? 0),
  }));
}

export async function createCycle(
  projectId: string, name: string, startDate: string, endDate: string,
): Promise<Cycle> {
  const sb = createAdminClient();
  const { data, error } = await sb.from('cycles').insert({
    project_id: Number(projectId), name, start_date: startDate, end_date: endDate,
  }).select('id, project_id, name, start_date, end_date, archived').single();
  if (error || !data) throw new PlaneApiError(502, `cycles create`);
  return {
    id: Number(data.id), project_id: Number(data.project_id),
    name: String(data.name), start_date: String(data.start_date),
    end_date: String(data.end_date), archived: Number(data.archived ?? 0),
  };
}

export async function updateCycle(
  cycleId: string,
  patch: { name?: string; startDate?: string; endDate?: string; archived?: number },
): Promise<void> {
  const sb = createAdminClient();
  const update: Row = {};
  if (patch.name !== undefined)      update.name = patch.name;
  if (patch.startDate !== undefined) update.start_date = patch.startDate;
  if (patch.endDate !== undefined)   update.end_date = patch.endDate;
  if (patch.archived !== undefined)  update.archived = patch.archived;
  if (Object.keys(update).length === 0) return;
  const { error } = await sb.from('cycles').update(update).eq('id', Number(cycleId));
  if (error) throw new PlaneApiError(502, `cycles/${cycleId}`);
}

export async function deleteCycle(cycleId: string): Promise<void> {
  const sb = createAdminClient();
  const { error } = await sb.from('cycles').delete().eq('id', Number(cycleId));
  if (error) throw new PlaneApiError(502, `cycles/${cycleId}`);
}

// ── Apply / remove labels on a work item (Phase 2) ─────────────────────

export async function applyLabel(itemId: string, labelId: number): Promise<void> {
  const sb = createAdminClient();
  const { error } = await sb.from('work_item_labels')
    .upsert({ work_item_id: Number(itemId), label_id: labelId },
            { onConflict: 'work_item_id,label_id' });
  if (error) throw new PlaneApiError(502, `apply-label/${itemId}/${labelId}`);
}

export async function removeLabel(itemId: string, labelId: number): Promise<void> {
  const sb = createAdminClient();
  const { error } = await sb.from('work_item_labels')
    .delete().eq('work_item_id', Number(itemId)).eq('label_id', labelId);
  if (error) throw new PlaneApiError(502, `remove-label/${itemId}/${labelId}`);
}

// ── Sub-issues (Phase 4) ────────────────────────────────────────────────

export interface SubIssue {
  id: number;
  sequence_id: number;
  name: string;
  priority: string;
  state_id: number | null;
  state_name: string | null;
  state_color: string | null;
  state_group: string | null;
  target_date: string | null;
  completed_at: string | null;
}

export async function getChildren(parentId: string): Promise<SubIssue[]> {
  const sb = createAdminClient();
  const { data, error } = await sb.from('work_items')
    .select('id, sequence_id, name, priority, state_id, target_date, completed_at, project_states(name, color, "group")')
    .eq('parent_id', Number(parentId))
    .eq('archived', 0)
    .order('sequence_id');
  if (error) throw new PlaneApiError(500, `children/${parentId}`);
  return (data ?? []).map((r: Row) => {
    const st = (r.project_states as Row | null) ?? null;
    return {
      id: Number(r.id),
      sequence_id: Number(r.sequence_id ?? 0),
      name: String(r.name),
      priority: String(r.priority ?? 'none'),
      state_id: r.state_id != null ? Number(r.state_id) : null,
      state_name: st ? String(st.name) : null,
      state_color: st ? String(st.color) : null,
      state_group: st ? String(st.group) : null,
      target_date: (r.target_date as string | null) ?? null,
      completed_at: (r.completed_at as string | null) ?? null,
    };
  });
}

// ── Saved views (Phase 4) ────────────────────────────────────────────────

export interface SavedView {
  id: number;
  user_id: number;
  project_id: number | null;
  name: string;
  filters: Record<string, unknown>;
  created_at: string;
}

export async function getSavedViews(userId: number, projectId?: string): Promise<SavedView[]> {
  const sb = createAdminClient();
  let q = sb.from('saved_views')
    .select('id, user_id, project_id, name, filters, created_at')
    .eq('user_id', userId);
  if (projectId) q = q.eq('project_id', Number(projectId));
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw new PlaneApiError(500, 'saved-views');
  return (data ?? []).map((r: Row) => ({
    id: Number(r.id), user_id: Number(r.user_id),
    project_id: r.project_id != null ? Number(r.project_id) : null,
    name: String(r.name),
    filters: (r.filters as Record<string, unknown>) ?? {},
    created_at: String(r.created_at),
  }));
}

export async function createSavedView(
  userId: number, projectId: string | null, name: string, filters: Record<string, unknown>,
): Promise<SavedView> {
  const sb = createAdminClient();
  const { data, error } = await sb.from('saved_views').insert({
    user_id: userId,
    project_id: projectId ? Number(projectId) : null,
    name, filters,
  }).select('id, user_id, project_id, name, filters, created_at').single();
  if (error || !data) throw new PlaneApiError(502, 'saved-views create');
  return {
    id: Number(data.id), user_id: Number(data.user_id),
    project_id: data.project_id != null ? Number(data.project_id) : null,
    name: String(data.name),
    filters: (data.filters as Record<string, unknown>) ?? {},
    created_at: String(data.created_at),
  };
}

export async function deleteSavedView(viewId: string, userId: number): Promise<void> {
  const sb = createAdminClient();
  // Scoped delete: only the owner can drop their own view.
  const { error } = await sb.from('saved_views')
    .delete().eq('id', Number(viewId)).eq('user_id', userId);
  if (error) throw new PlaneApiError(502, `saved-views/${viewId}`);
}

export async function updateWorkItem(
  projectId: string,
  itemId: string,
  updates: { state?: string; priority?: string; name?: string; target_date?: string | null },
): Promise<PlaneWorkItem> {
  const sb = createAdminClient();
  const patch: Row = { updated_at: new Date().toISOString() };
  if (updates.state !== undefined) patch.state_id = Number(updates.state);
  if (updates.priority !== undefined) patch.priority = updates.priority;
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.target_date !== undefined) patch.target_date = updates.target_date;

  // If moved into a completed-group state, stamp completed_at; clear it otherwise.
  if (updates.state !== undefined) {
    const { data: st } = await sb.from('project_states')
      .select('group').eq('id', Number(updates.state)).maybeSingle();
    if (st) {
      patch.completed_at = String(st.group) === 'completed' ? new Date().toISOString() : null;
    }
  }

  const { error } = await sb.from('work_items')
    .update(patch).eq('id', Number(itemId)).eq('project_id', Number(projectId));
  if (error) throw new PlaneApiError(502, `work-items/${itemId}`);

  const updated = (await getWorkItems(projectId)).find(w => w.id === String(itemId));
  if (!updated) throw new PlaneApiError(502, `work-items/${itemId} readback`);
  return updated;
}

export async function createWorkItem(
  projectId: string,
  data: { name: string; state?: string; priority?: string },
): Promise<PlaneWorkItem> {
  const sb = createAdminClient();
  const pid = Number(projectId);

  // NOTE: read-modify-write on next_sequence is not atomic. The UNIQUE(project_id, sequence_id)
  // constraint makes a concurrent collision fail loudly rather than silently duplicate.
  // TODO: replace with an atomic Postgres RPC if write concurrency increases.
  // Per-project sequence counter (Plane auto-assigned this).
  const { data: proj } = await sb.from('projects')
    .select('next_sequence').eq('id', pid).maybeSingle();
  const seq = Number(proj?.next_sequence ?? 1);

  const { data: inserted, error } = await sb.from('work_items').insert({
    project_id: pid,
    sequence_id: seq,
    name: data.name,
    priority: data.priority ?? 'none',
    state_id: data.state ? Number(data.state) : null,
  }).select('id').single();
  if (error || !inserted) throw new PlaneApiError(502, `work-items create`);

  await sb.from('projects').update({ next_sequence: seq + 1 }).eq('id', pid);

  const created = (await getWorkItems(projectId)).find(w => w.id === String(inserted.id));
  if (!created) throw new PlaneApiError(502, 'work-items create readback');
  return created;
}

export function buildStateLookup(states: PlaneState[]): Map<string, PlaneState> {
  return new Map(states.map(s => [s.id, s]));
}

export function enrichWorkItems(
  items: PlaneWorkItem[],
  lookup: Map<string, PlaneState>,
): PlaneWorkItem[] {
  return items.map(item => {
    if (item.state_detail) return item;
    const resolved = item.state ? lookup.get(item.state) : undefined;
    if (!resolved) return item;
    return {
      ...item,
      state_detail: {
        id: resolved.id, name: resolved.name,
        group: resolved.group, color: resolved.color,
      },
    };
  });
}

export function getStateGroup(item: PlaneWorkItem): string {
  return (item.state_detail?.group ?? '').toLowerCase();
}
export function isActiveGroup(group: string): boolean {
  return ['started', 'in_progress', 'inprogress', 'in progress', 'unstarted'].includes(group);
}
export function isBacklogGroup(group: string): boolean {
  return ['backlog', 'todo', 'unstarted'].includes(group);
}
export function isCompletedGroup(group: string): boolean {
  return group === 'completed';
}

// ── Project CRUD (self-service create / edit / archive) ───────────────────

/** Default workflow states bootstrapped on every new project. */
const DEFAULT_STATES: Array<Omit<{ name: string; group: string; color: string; sequence: number }, never>> = [
  { name: 'Backlog',     group: 'backlog',   color: '#94a3b8', sequence: 0 },
  { name: 'To Do',       group: 'unstarted', color: '#3b82f6', sequence: 1 },
  { name: 'In Progress', group: 'started',   color: '#eab308', sequence: 2 },
  { name: 'In Review',   group: 'started',   color: '#f97316', sequence: 3 },
  { name: 'Done',        group: 'completed', color: '#22c55e', sequence: 4 },
  { name: 'Cancelled',   group: 'cancelled', color: '#ef4444', sequence: 5 },
];

export async function createProject(input: {
  name: string;
  identifier?: string;     // optional — auto-generated if omitted
  description?: string;
  team?: string | null;
  createdBy: number;       // users.id of creator → added as project_member 'lead'
}): Promise<PlaneProject> {
  const sb = createAdminClient();

  // 1. Resolve identifier — auto-generate from name initials if not provided.
  let ident = (input.identifier ?? '').trim().toUpperCase();
  if (!ident) {
    const base = input.name
      .split(/\s+/).filter(Boolean).slice(0, 3)
      .map(w => w[0]!.toUpperCase()).join('');
    ident = base || 'P';
  }
  // Ensure uniqueness by appending numbers if needed.
  let suffix = 0;
  while (true) {
    const candidate = suffix === 0 ? ident : `${ident}${suffix}`;
    const { data: existing } = await sb.from('projects')
      .select('id').eq('identifier', candidate).maybeSingle();
    if (!existing) { ident = candidate; break; }
    suffix += 1;
    if (suffix > 99) throw new PlaneApiError(502, 'projects create — identifier collision');
  }

  // 2. Insert the project row. Normalize team through the org-chart canonical
  //    list so we don't accumulate ghost team names from typos / casing drift.
  const normalizedTeam = input.team ? mapOrgDeptToAppTeam(input.team) : null;
  const { data: inserted, error } = await sb.from('projects').insert({
    identifier:  ident,
    name:        input.name.trim(),
    description: input.description ?? null,
    team:        normalizedTeam,
  }).select('id, name, identifier, description, network, team, auto_archive_done_days').single();
  if (error || !inserted) throw new PlaneApiError(502, 'projects create');

  const pid = Number(inserted.id);

  // 3. Bootstrap default states so the board is usable immediately.
  const { error: stErr } = await sb.from('project_states').insert(
    DEFAULT_STATES.map(s => ({ project_id: pid, ...s })),
  );
  if (stErr) throw new PlaneApiError(502, `projects create — default states (${stErr.message})`);

  // 4. Add the creator as a project_member with role 'lead'. Idempotent.
  await sb.from('project_members')
    .upsert({ project_id: pid, user_id: input.createdBy, role: 'lead' },
            { onConflict: 'project_id,user_id' });

  return mapProject(inserted as Row);
}

export async function updateProject(
  projectId: string,
  patch: ProjectPatch,
): Promise<void> {
  const sb = createAdminClient();
  const normalized = normalizeProjectPatch(patch);
  const update: Row = { updated_at: new Date().toISOString() };
  if (normalized.name !== undefined)        update.name = normalized.name;
  if (normalized.description !== undefined) update.description = normalized.description;
  if (normalized.team !== undefined)        update.team = normalized.team ? mapOrgDeptToAppTeam(normalized.team) : null;
  if (normalized.archived !== undefined)    update.archived = normalized.archived;
  if (normalized.autoArchiveDoneDays !== undefined) update.auto_archive_done_days = normalized.autoArchiveDoneDays;
  if (Object.keys(update).length === 1) return; // only updated_at — skip
  const { error } = await sb.from('projects')
    .update(update).eq('id', Number(projectId));
  if (error) throw new PlaneApiError(502, `projects/${projectId}`);
}

export async function archiveProject(projectId: string): Promise<void> {
  // Soft-delete via the existing `archived` flag (already filtered out of getProjects).
  return updateProject(projectId, { archived: 1 });
}
