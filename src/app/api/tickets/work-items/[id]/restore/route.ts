import { NextResponse } from 'next/server';
import { getWorkItemDetail, restoreWorkItem, logActivity } from '@/lib/tickets';
import { canArchiveWorkItem } from '@/lib/permissions';
import { route, requireSession, forbidden, notFound } from '@/lib/api';

export const runtime = 'nodejs';

// POST /api/tickets/work-items/[id]/restore — un-archive a task (Lead/admin).
// The task reappears in its state column on the board.
export const POST = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireSession();
  const { id } = await params;

  const item = await getWorkItemDetail(id);
  if (!item) throw notFound();
  if (!(await canArchiveWorkItem(session, item.project_id))) {
    throw forbidden('Lead+ only');
  }

  try {
    await restoreWorkItem(id);
    await logActivity(Number(id), session.id, 'restored');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});
