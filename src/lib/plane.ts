// Server-only — never import this in client components ('use client')

const BASE = (process.env.PLANE_BASE_URL ?? '').replace(/\/$/, '');
const KEY = process.env.PLANE_API_KEY ?? '';
const WS = process.env.PLANE_WORKSPACE_SLUG ?? 'romega';

const HEADERS = {
  'X-API-Key': KEY,
  'Content-Type': 'application/json',
};

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
  state_detail?: {
    id: string;
    name: string;
    group: string;
    color: string;
  };
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

export class PlaneApiError extends Error {
  constructor(public readonly status: number, path: string) {
    super(`Plane API ${status}: ${path}`);
  }
}

async function planeMutate<T>(
  method: 'POST' | 'PATCH',
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  if (!BASE || !KEY) throw new Error('PLANE_BASE_URL and PLANE_API_KEY must be set in .env');
  const url = `${BASE}/api/v1/workspaces/${WS}${path}`;
  const res = await fetch(url, {
    method,
    headers: HEADERS,
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) throw new PlaneApiError(res.status, path);
  return res.json() as Promise<T>;
}

export async function updateWorkItem(
  projectId: string,
  itemId: string,
  updates: { state?: string; priority?: string; name?: string; target_date?: string | null },
): Promise<PlaneWorkItem> {
  return planeMutate('PATCH', `/projects/${projectId}/work-items/${itemId}/`, updates);
}

export async function createWorkItem(
  projectId: string,
  data: { name: string; state?: string; priority?: string },
): Promise<PlaneWorkItem> {
  return planeMutate('POST', `/projects/${projectId}/work-items/`, data);
}

async function planeGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  if (!BASE || !KEY) {
    throw new Error('PLANE_BASE_URL and PLANE_API_KEY must be set in .env');
  }
  const url = new URL(`${BASE}/api/v1/workspaces/${WS}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const res = await fetch(url.toString(), {
    headers: HEADERS,
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new PlaneApiError(res.status, path);
  return res.json() as Promise<T>;
}

async function planeGetAll<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;

  for (;;) {
    const p: Record<string, string> = { ...params, per_page: '100' };
    if (cursor) p.cursor = cursor;

    const data = await planeGet<{
      results: T[];
      next_cursor?: string;
      next_page_results?: boolean;
    }>(path, p);

    all.push(...(data.results ?? []));

    if (!data.next_page_results || !data.next_cursor) break;
    cursor = data.next_cursor;
  }

  return all;
}

export async function getProjects(): Promise<PlaneProject[]> {
  const data = await planeGet<{ results: PlaneProject[] }>('/projects/');
  return data.results ?? [];
}

export async function getProjectStates(projectId: string): Promise<PlaneState[]> {
  try {
    const data = await planeGet<{ results: PlaneState[] }>(
      `/projects/${projectId}/states/`,
    );
    return (data.results ?? []).sort((a, b) => a.sequence - b.sequence);
  } catch (err) {
    if (err instanceof PlaneApiError && (err.status === 403 || err.status === 404)) return [];
    throw err;
  }
}

export async function getWorkspaceMembers(): Promise<PlaneMember[]> {
  // /members/ returns a flat array, unlike other endpoints that return { results: [] }
  const data = await planeGet<PlaneMember[] | { results: PlaneMember[] }>('/members/');
  if (Array.isArray(data)) return data;
  return data.results ?? [];
}

export async function getWorkItems(
  projectId: string,
  params?: Record<string, string>,
): Promise<PlaneWorkItem[]> {
  try {
    return await planeGetAll<PlaneWorkItem>(
      `/projects/${projectId}/work-items/`,
      params,
    );
  } catch (err) {
    // 403 = API key not a member of this project; 404 = project gone.
    // Return empty rather than crashing every page that loads items.
    if (err instanceof PlaneApiError && (err.status === 403 || err.status === 404)) return [];
    throw err;
  }
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
    const stateId = typeof item.state === 'string' ? item.state : '';
    const resolved = stateId ? lookup.get(stateId) : undefined;
    if (!resolved) return item;
    return {
      ...item,
      state_detail: {
        id: resolved.id,
        name: resolved.name,
        group: resolved.group,
        color: resolved.color,
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
