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
import { canEditWorkItem, canArchiveWorkItem, canViewProject, getProjectCaps } from '@/lib/permissions';
import { notifyTaskAssigned, newlyAddedAssignees } from '@/lib/notifications';
import { route, requireSession, parseBody, forbidden, notFound } from '@/lib/api';
import { sanitizeRichText } from '@/lib/sanitize';

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

  // Field-level gate: Members may edit items but not the due date or assignees
  // (Lead/admin only). The task panel always sends the full payload, so strip
  // the restricted fields rather than rejecting the whole save.
  const caps = await getProjectCaps(session, before.project_id);
  if (!caps.canEditDates) delete patch.target_date;
  if (!caps.canEditAssignees) delete patch.assigneeUserIds;

  // The description is now rich-text HTML (Tiptap). Sanitize server-side as the
  // authoritative pass — the client sanitizes too, but never trust the client.
  if (typeof patch.description === 'string') {
    patch.description = sanitizeRichText(patch.description);
  }

  try {
    await patchWorkItem(id, patch);
    for (const a of diffActivity(before, patch)) {
      await logActivity(Number(id), session.id, a.action, a.from, a.to);
    }
    const updated = await getWorkItemDetail(id);

    // Notify each NEWLY-added assignee (in-app bell + opt-in email). Diff the
    // pre-patch assignee list against the requested one; self-adds are dropped
    // by createNotification's actor===recipient guard. Best-effort: never let a
    // notification hiccup fail the save.
    if (patch.assigneeUserIds) {
      const added = newlyAddedAssignees(before.assignee_ids ?? [], patch.assigneeUserIds);
      if (added.length) {
        const name = updated?.name ?? before.name;
        await Promise.all(added.map((uid) =>
          notifyTaskAssigned({
            userId:   uid,
            actorId:  session.id,
            workItem: { id: before.id, projectId: before.project_id, name },
          }).catch(() => { /* swallow — bell/email is secondary to the patch */ }),
        ));
      }
    }

    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});

// DELETE /api/tickets/work-items/[id] — soft delete (archive flag). Project lead / admin.
export const DELETE = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireSession();
  const { id } = await params;
  const item = await getWorkItemDetail(id);
  if (!item) throw notFound();
  if (!(await canArchiveWorkItem(session, item.project_id))) {
    throw forbidden('Lead+ only');
  }
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
