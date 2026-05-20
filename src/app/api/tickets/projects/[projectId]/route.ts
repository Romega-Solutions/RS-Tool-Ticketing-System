import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { updateProject, archiveProject } from '@/lib/tickets';
import {
  canEditProject,
  canReteamProject,
  canArchiveProject,
} from '@/lib/permissions';

export const runtime = 'nodejs';

// PATCH /api/tickets/projects/[projectId]
// Body: { name?, description?, team? }
// Any authenticated user can edit name/description. Only lead/admin can re-team.
export async function PATCH(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canEditProject(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { name?: string; description?: string | null; team?: string | null } = {};
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  if (body.team !== undefined && !canReteamProject(session)) {
    return NextResponse.json({ error: 'Only leads/admins can change a project team' }, { status: 403 });
  }

  const { projectId } = await params;
  try {
    await updateProject(projectId, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
}

// DELETE /api/tickets/projects/[projectId]  — soft-delete (archive). Lead/admin only.
export async function DELETE(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canArchiveProject(session)) {
    return NextResponse.json({ error: 'Only leads/admins can archive a project' }, { status: 403 });
  }

  const { projectId } = await params;
  try {
    await archiveProject(projectId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
}
