import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { applyLabel, removeLabel, getWorkItemDetail, logActivity } from '@/lib/tickets';
import { canEditWorkItem } from '@/lib/permissions';

export const runtime = 'nodejs';

// POST { labelId } — attach a label to the work item
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const detail = await getWorkItemDetail(id);
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await canEditWorkItem(session, { id: detail.id, projectId: detail.project_id }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { labelId?: number } = {};
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (!body.labelId) return NextResponse.json({ error: 'labelId required' }, { status: 400 });

  try {
    await applyLabel(id, body.labelId);
    await logActivity(Number(id), session.id, 'edited', 'label', `+${body.labelId}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
}

// DELETE ?labelId= — remove a label from the work item
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const detail = await getWorkItemDetail(id);
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await canEditWorkItem(session, { id: detail.id, projectId: detail.project_id }))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const labelId = Number(new URL(req.url).searchParams.get('labelId'));
  if (!labelId) return NextResponse.json({ error: 'labelId required' }, { status: 400 });

  try {
    await removeLabel(id, labelId);
    await logActivity(Number(id), session.id, 'edited', 'label', `-${labelId}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
}
