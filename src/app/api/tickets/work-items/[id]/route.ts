import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import {
  getWorkItemDetail,
  patchWorkItem,
  archiveWorkItem,
  diffActivity,
  logActivity,
  type WorkItemPatch,
} from '@/lib/tickets';
import { canEditWorkItem, canArchiveWorkItem, canViewProject } from '@/lib/permissions';

export const runtime = 'nodejs';

// GET /api/tickets/work-items/[id] — full detail with comments + activity not included.
// Use the dedicated /comments and /activity routes for those.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const detail = await getWorkItemDetail(id);
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await canViewProject(session, detail.project_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json(detail);
}

// PATCH /api/tickets/work-items/[id] — full edit (any field, including assignees)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const before = await getWorkItemDetail(id);
  if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await canEditWorkItem(session, { id: before.id, projectId: before.project_id }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let patch: WorkItemPatch = {};
  try { patch = (await req.json()) as WorkItemPatch; }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

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
}

// DELETE /api/tickets/work-items/[id] — soft delete (archive flag). Admin only.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canArchiveWorkItem(session)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
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
}
