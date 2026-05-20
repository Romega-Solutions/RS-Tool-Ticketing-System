import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import {
  createWorkItem,
  patchWorkItem,
  getWorkItemDetail,
  getWorkItems,
  diffActivity,
  logActivity,
} from '@/lib/tickets';
import { canEditWorkItem, canViewProject } from '@/lib/permissions';

export const runtime = 'nodejs';

// GET /api/tickets/work-items?projectId=123
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = new URL(req.url).searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }
  if (!(await canViewProject(session, Number(projectId)))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    return NextResponse.json(await getWorkItems(projectId));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
}

// POST /api/tickets/work-items  { projectId, name, state?, priority? }
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { projectId?: string; name?: string; state?: string; priority?: string } = {};
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const { projectId, name, ...rest } = body;
  if (!projectId || !name?.trim()) {
    return NextResponse.json({ error: 'projectId and name are required' }, { status: 400 });
  }
  if (!(await canViewProject(session, Number(projectId)))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const created = await createWorkItem(projectId, { name: name.trim(), ...rest });
    await logActivity(Number(created.id), session.id, 'created', null, name.trim());
    return NextResponse.json(created);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create work item' },
      { status: 502 },
    );
  }
}

// PATCH /api/tickets/work-items  { projectId, itemId, state?, priority?, name?, target_date? }
// Kept as a body-shaped endpoint so the Kanban board's drag handler can swap
// the URL and keep its payload exactly the same as /api/plane/work-items.
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    projectId?: string;
    itemId?: string;
    state?: string;
    priority?: string;
    name?: string;
    description?: string | null;
    target_date?: string | null;
    assigneeUserIds?: number[];
  } = {};
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const { projectId, itemId, ...patch } = body;
  if (!projectId || !itemId) {
    return NextResponse.json({ error: 'projectId and itemId are required' }, { status: 400 });
  }

  const before = await getWorkItemDetail(itemId);
  if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await canEditWorkItem(session, { id: before.id, projectId: before.project_id }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await patchWorkItem(itemId, patch);
    const after = await getWorkItemDetail(itemId);
    for (const a of diffActivity(before, patch)) {
      await logActivity(Number(itemId), session.id, a.action, a.from, a.to);
    }
    // Re-shape to legacy /api/plane/work-items response — caller expects the
    // updated work item (single-item) back.
    const list = await getWorkItems(projectId);
    const updated = list.find(w => w.id === String(itemId)) ?? after;
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
}
