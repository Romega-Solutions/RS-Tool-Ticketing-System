import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getWorkItemDetail,
  patchWorkItem,
  archiveWorkItem,
  diffActivity,
  logActivity,
  type WorkItemPatch,
} from '@/lib/tickets';
import { canEditWorkItem, canArchiveWorkItem, canViewProject } from '@/lib/permissions';
import { route, requireSession, parseBody, forbidden, notFound } from '@/lib/api';

export const runtime = 'nodejs';

const idParam = z.union([z.string(), z.number()]).transform((v) => String(v));

const patchSchema = z.object({
  state: idParam.optional(),
  priority: z.string().optional(),
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  target_date: z.string().nullable().optional(),
  cycle_id: z.number().nullable().optional(),
  parent_id: z.number().nullable().optional(),
  assigneeUserIds: z.array(z.number()).optional(),
});

// GET /api/tickets/work-items/[id] — full detail with comments + activity not included.
// Use the dedicated /comments and /activity routes for those.
export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireSession();

  const { id } = await params;
  const detail = await getWorkItemDetail(id);
  if (!detail) throw notFound();
  if (!(await canViewProject(session, detail.project_id))) {
    throw forbidden();
  }
  return NextResponse.json(detail);
});

// PATCH /api/tickets/work-items/[id] — full edit (any field, including assignees)
export const PATCH = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireSession();

  const { id } = await params;
  const before = await getWorkItemDetail(id);
  if (!before) throw notFound();
  if (!(await canEditWorkItem(session, { id: before.id, projectId: before.project_id }))) {
    throw forbidden();
  }

  const patch: WorkItemPatch = await parseBody(req, patchSchema);

  try {
    await patchWorkItem(id, patch);
    for (const a of diffActivity(before, patch)) {
      await logActivity(Number(id), session.id, a.action, a.from, a.to);
    }
    const updated = await getWorkItemDetail(id);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});

// DELETE /api/tickets/work-items/[id] — soft delete (archive flag). Admin only.
export const DELETE = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireSession();
  if (!canArchiveWorkItem(session)) {
    throw forbidden('Admin only');
  }
  const { id } = await params;
  try {
    await archiveWorkItem(id);
    await logActivity(Number(id), session.id, 'archived');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});
