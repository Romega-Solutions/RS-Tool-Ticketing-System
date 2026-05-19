// Server-only — never import this in client components ('use client').
// Drop-in replacement for src/lib/plane.ts, backed by Supabase instead of the Plane API.
import { createAdminClient } from '@/lib/supabase/admin';

export interface PlaneProject {
  id: string;
  name: string;
  identifier: string;
  description: string;
  network: number;
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
}

// Kept for signature compatibility with callers that catch PlaneApiError.
export class PlaneApiError extends Error {
  constructor(public readonly status: number, path: string) {
    super(`Tickets DB ${status}: ${path}`);
  }
}

type Row = Record<string, unknown>;

function mapProject(r: Row): PlaneProject {
  return {
    id: String(r.id),
    name: String(r.name),
    identifier: String(r.identifier ?? ''),
    description: String(r.description ?? ''),
    network: Number(r.network ?? 2),
  };
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

export async function getProjects(): Promise<PlaneProject[]> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from('projects')
    .select('id, name, identifier, description, network')
    .eq('archived', 0)
    .order('name');
  if (error) throw new PlaneApiError(500, 'projects');
  return (data ?? []).map(mapProject);
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
  // The Plane member id == users.plane_member_id; surface it as PlaneMember.id
  // so existing member-picker code keeps working unchanged.
  const { data, error } = await sb
    .from('users')
    .select('plane_member_id, name, email')
    .not('plane_member_id', 'is', null)
    .eq('is_active', 1);
  if (error) throw new PlaneApiError(500, 'members');
  return (data ?? []).map((u: Row) => ({
    id: String(u.plane_member_id),
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
    .select('id, sequence_id, name, description, priority, state_id, target_date, completed_at, created_at, updated_at, work_item_assignees(member_key)')
    .eq('project_id', Number(projectId))
    .order('sequence_id');

  if (error) throw new PlaneApiError(500, `work-items/${projectId}`);

  let items: PlaneWorkItem[] = (data ?? []).map((r: Row) => {
    const assignees = ((r.work_item_assignees as Row[] | null) ?? [])
      .map(a => String(a.member_key));
    return {
      id: String(r.id),
      sequence_id: Number(r.sequence_id ?? 0),
      name: String(r.name),
      description_stripped: r.description ? String(r.description) : undefined,
      state: r.state_id != null ? String(r.state_id) : '',
      priority: (String(r.priority ?? 'none')) as PlaneWorkItem['priority'],
      assignees,
      assignee_ids: assignees,
      target_date: (r.target_date as string | null) ?? null,
      completed_at: (r.completed_at as string | null) ?? null,
      created_at: String(r.created_at ?? ''),
      updated_at: String(r.updated_at ?? ''),
    };
  });

  // Client-side assignee filter — mirrors Plane's ?assignee= param exactly.
  const assignee = params?.assignee;
  if (assignee) items = items.filter(i => i.assignees.includes(assignee));
  return items;
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
