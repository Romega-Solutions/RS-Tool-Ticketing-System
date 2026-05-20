import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getComment, updateComment, deleteComment } from '@/lib/tickets';

export const runtime = 'nodejs';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { commentId } = await params;
  const existing = await getComment(commentId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.author_id !== session.id && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { body?: string } = {};
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const trimmed = (body.body ?? '').trim();
  if (!trimmed) return NextResponse.json({ error: 'body is required' }, { status: 400 });

  try {
    await updateComment(commentId, trimmed);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { commentId } = await params;
  const existing = await getComment(commentId);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.author_id !== session.id && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await deleteComment(commentId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
}
