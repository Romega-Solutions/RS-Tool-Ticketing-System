import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createWorkItem,
  patchWorkItem,
  getWorkItemDetail,
  getWorkItems,
  diffActivity,
  logActivity,
} from '@/lib/tickets';
import { canEditWorkItem, canViewProject, canCreateWorkItem, getProjectCaps } from '@/lib/permissions';
import { route, requireSession, parseBody, badRequest, forbidden, notFound } from '@/lib/api';

export const runtime = 'nodejs';

// projectId / itemId arrive as strings from the client but tolerate numbers.
const idParam = z.union([z.string().min(1), z.number()]).transform((v) => String(v));

const createSchema = z.object({
  projectId: idParam,
  name: z.string().trim().min(1, 'name is required'),
  state: z.string().optional(),
  priority: z.string().optional(),
});

const patchSchema = z.object({
  projectId: idParam,
  itemId: idParam,
  state: z.string().optional(),
  priority: z.string().optional(),
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  target_date: z.string().nullable().optional(),
  assigneeUserIds: z.array(z.number()).optional(),
});

// GET /api/tickets/work-items?projectId=123
export const GET = route(async (req: Request) => {
  const session = await requireSession();

  const projectId = new URL(req.url).searchParams.get('projectId');
  if (!projectId) throw badRequest('projectId is required');
  if (!(await canViewProject(session, Number(projectId)))) throw forbidden();

  try {
    return NextResponse.json(await getWorkItems(projectId));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});

// POST /api/tickets/work-items  { projectId, name, state?, priority? }
export const POST = route(async (req: Request) => {
  const session = await requireSession();

  const { projectId, name, state, priority } = await parseBody(req, createSchema);
  if (!(await canCreateWorkItem(session, Number(projectId)))) throw forbidden();

  try {
    const created = await createWorkItem(projectId, { name, state, priority });
    await logActivity(Number(created.id), session.id, 'created', null, name);
    return NextResponse.json(created);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create work item' },
      { status: 502 },
    );
  }
});

// PATCH /api/tickets/work-items  { projectId, itemId, state?, priority?, name?, target_date? }
// Kept as a body-shaped endpoint so the Kanban board's drag handler can swap
// the URL and keep its payload exactly the same as /api/plane/work-items.
export const PATCH = route(async (req: Request) => {
  const session = await requireSession();

  const { projectId, itemId, ...patch } = await parseBody(req, patchSchema);

  const before = await getWorkItemDetail(itemId);
  if (!before) throw notFound();
  if (!(await canEditWorkItem(session, { id: before.id, projectId: before.project_id }))) {
    throw forbidden();
  }

  // Members may move/edit items but not the due date or assignees (Lead/admin only).
  const caps = await getProjectCaps(session, before.project_id);
  if (!caps.canEditDates) delete patch.target_date;
  if (!caps.canEditAssignees) delete patch.assigneeUserIds;

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
});
