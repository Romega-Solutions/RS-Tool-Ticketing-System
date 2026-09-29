import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getComment, updateComment, deleteComment } from '@/lib/tickets';
import { sanitizeRichText, isRichTextEmpty } from '@/lib/sanitize';
import { route, requireSession, parseBody, badRequest, forbidden, notFound } from '@/lib/api';

export const runtime = 'nodejs';

type CommentCtx = { params: Promise<{ id: string; commentId: string }> };

const commentSchema = z.object({
  body: z.string().nullable().optional(),
});

// Both edit and delete are recorded on the row (who + when) and surfaced in
// the task's Activity timeline, so neither can happen without a footprint.
async function loadEditable(ctx: CommentCtx, session: { id: number; role: string }) {
  const { id, commentId } = await ctx.params;
  const existing = await getComment(commentId);
  if (!existing || existing.work_item_id !== Number(id) || existing.deleted) throw notFound();
  if (existing.author_id !== session.id && session.role !== 'admin') {
    throw forbidden();
  }
  return commentId;
}

export const PATCH = route(async (req: Request, ctx: CommentCtx) => {
  const session = await requireSession();
  const commentId = await loadEditable(ctx, session);

  const body = await parseBody(req, commentSchema);

  const rawHtml = body.body ?? '';
  if (isRichTextEmpty(rawHtml)) throw badRequest('body is required');

  try {
    await updateComment(commentId, sanitizeRichText(rawHtml), session.id);
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
  const commentId = await loadEditable(ctx, session);

  try {
    await deleteComment(commentId, session.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});
