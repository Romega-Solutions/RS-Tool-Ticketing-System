import { NextResponse } from 'next/server';
import { z } from 'zod';
import { applyLabel, removeLabel, getWorkItemDetail, logActivity } from '@/lib/tickets';
import { canEditWorkItem } from '@/lib/permissions';
import { route, requireSession, parseBody, badRequest, forbidden, notFound } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';
import { encodeLabelActivity } from '@/lib/activity-describe';

export const runtime = 'nodejs';

// Label name stored with the activity row so the log stays readable even
// after the label is renamed or deleted. Best-effort: null on any failure.
async function labelName(labelId: number): Promise<string | null> {
  try {
    const { data } = await createAdminClient().from('labels').select('name').eq('id', labelId).maybeSingle();
    return data?.name == null ? null : String(data.name);
  } catch {
    return null;
  }
}

const labelSchema = z.object({
  labelId: z.number().int().positive().optional(),
});

// POST { labelId } — attach a label to the work item
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireSession();

  const { id } = await params;
  const detail = await getWorkItemDetail(id);
  if (!detail) throw notFound();
  if (!(await canEditWorkItem(session, { id: detail.id, projectId: detail.project_id }))) {
    throw forbidden();
  }

  const body = await parseBody(req, labelSchema);
  if (!body.labelId) throw badRequest('labelId required');

  try {
    await applyLabel(id, body.labelId);
    await logActivity(Number(id), session.id, 'edited', 'label', encodeLabelActivity('+', body.labelId, await labelName(body.labelId)));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});

// DELETE ?labelId= — remove a label from the work item
export const DELETE = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireSession();

  const { id } = await params;
  const detail = await getWorkItemDetail(id);
  if (!detail) throw notFound();
  if (!(await canEditWorkItem(session, { id: detail.id, projectId: detail.project_id }))) {
    throw forbidden();
  }

  const labelId = Number(new URL(req.url).searchParams.get('labelId'));
  if (!labelId) throw badRequest('labelId required');

  try {
    await removeLabel(id, labelId);
    await logActivity(Number(id), session.id, 'edited', 'label', encodeLabelActivity('-', labelId, await labelName(labelId)));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});
