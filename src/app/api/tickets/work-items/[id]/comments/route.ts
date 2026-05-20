import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getWorkItemDetail, getComments, createComment, logActivity } from '@/lib/tickets';
import { canCommentOnProject, canViewProject } from '@/lib/permissions';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const detail = await getWorkItemDetail(id);
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await canViewProject(session, detail.project_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json(await getComments(id));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const detail = await getWorkItemDetail(id);
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await canCommentOnProject(session, detail.project_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { body?: string } = {};
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const trimmed = (body.body ?? '').trim();
  if (!trimmed) return NextResponse.json({ error: 'body is required' }, { status: 400 });

  try {
    const created = await createComment(id, session.id, trimmed);
    await logActivity(Number(id), session.id, 'commented', null, trimmed.slice(0, 80));
    return NextResponse.json(created);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
}
