import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getProjectComment, updateProjectComment, deleteProjectComment } from '@/lib/tickets';
import { route, requireSession, parseBody, badRequest, forbidden, notFound } from '@/lib/api';

export const runtime = 'nodejs';

type CommentCtx = { params: Promise<{ projectId: string; commentId: string }> };

const commentSchema = z.object({
  body: z.string().nullable().optional(),
});

export const PATCH = route(async (req: Request, ctx: CommentCtx) => {
  const session = await requireSession();

  const { commentId } = await ctx.params;
  const existing = await getProjectComment(commentId);
  if (!existing) throw notFound();
  if (existing.author_id !== session.id && session.role !== 'admin') {
    throw forbidden();
  }

  const body = await parseBody(req, commentSchema);

  const trimmed = (body.body ?? '').trim();
  if (!trimmed) throw badRequest('body is required');

  try {
    await updateProjectComment(commentId, trimmed);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});

export const DELETE = route(async (_req: Request, ctx: CommentCtx) => {
  const session = await requireSession();

  const { commentId } = await ctx.params;
  const existing = await getProjectComment(commentId);
  if (!existing) throw notFound();
  if (existing.author_id !== session.id && session.role !== 'admin') {
    throw forbidden();
  }

  try {
    await deleteProjectComment(commentId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});
