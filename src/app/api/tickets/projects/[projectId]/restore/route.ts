import { NextResponse } from 'next/server';
import { restoreProject } from '@/lib/tickets';
import { canArchiveProject } from '@/lib/permissions';
import { route, requireSession, forbidden } from '@/lib/api';

export const runtime = 'nodejs';

// POST /api/tickets/projects/[projectId]/restore — un-archive a project.
// Same gate as the archive (DELETE) route: project lead / admin only.
export const POST = route(async (_req: Request, { params }: { params: Promise<{ projectId: string }> }) => {
  const session = await requireSession();
  const { projectId } = await params;
  if (!(await canArchiveProject(session, Number(projectId)))) {
    throw forbidden('Only leads/admins can restore a project');
  }

  try {
    await restoreProject(projectId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});
