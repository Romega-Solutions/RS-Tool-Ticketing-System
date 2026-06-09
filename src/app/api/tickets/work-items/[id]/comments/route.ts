import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkItemDetail, getComments, createComment, logActivity } from '@/lib/tickets';
import { canCommentOnProject, canViewProject } from '@/lib/permissions';
import { route, requireSession, parseBody, badRequest, forbidden, notFound } from '@/lib/api';

export const runtime = 'nodejs';

const commentSchema = z.object({
  body: z.string().nullable().optional(),
});

export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireSession();
  const { id } = await params;
  const detail = await getWorkItemDetail(id);
  if (!detail) throw notFound();
  if (!(await canViewProject(session, detail.project_id))) {
    throw forbidden();
  }
  return NextResponse.json(await getComments(id));
});

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireSession();

  const { id } = await params;
  const detail = await getWorkItemDetail(id);
  if (!detail) throw notFound();
  if (!(await canCommentOnProject(session, detail.project_id))) {
    throw forbidden();
  }

  const body = await parseBody(req, commentSchema);

  const trimmed = (body.body ?? '').trim();
  if (!trimmed) throw badRequest('body is required');

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
});
