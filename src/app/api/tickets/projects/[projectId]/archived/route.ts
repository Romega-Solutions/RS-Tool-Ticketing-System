import { NextResponse } from 'next/server';
import { getArchivedWorkItems } from '@/lib/tickets';
import { canViewProject } from '@/lib/permissions';
import { route, requireSession, forbidden } from '@/lib/api';

export const runtime = 'nodejs';

// GET /api/tickets/projects/[projectId]/archived — the project Archive view.
// Visible to anyone who can view the project (restore is gated separately).
export const GET = route(async (_req: Request, { params }: { params: Promise<{ projectId: string }> }) => {
  const session = await requireSession();
  const { projectId } = await params;

  if (!(await canViewProject(session, Number(projectId)))) {
    throw forbidden();
  }

  return NextResponse.json(await getArchivedWorkItems(projectId));
});
