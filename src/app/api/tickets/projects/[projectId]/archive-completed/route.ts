import { NextResponse } from 'next/server';
import { bulkArchiveCompleted } from '@/lib/tickets';
import { canArchiveWorkItem } from '@/lib/permissions';
import { route, requireSession, forbidden } from '@/lib/api';

export const runtime = 'nodejs';

// POST /api/tickets/projects/[projectId]/archive-completed
// Manual bulk archive: clears every Done task in the project (Lead/admin).
// Returns { count, ids } so the board can drop the cards optimistically.
export const POST = route(async (_req: Request, { params }: { params: Promise<{ projectId: string }> }) => {
  const session = await requireSession();
  const { projectId } = await params;

  if (!(await canArchiveWorkItem(session, Number(projectId)))) {
    throw forbidden('Lead+ only');
  }

  try {
    const result = await bulkArchiveCompleted(projectId, session.id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});
