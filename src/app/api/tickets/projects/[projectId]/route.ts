import { NextResponse } from 'next/server';
import { z } from 'zod';
import { updateProject, archiveProject } from '@/lib/tickets';
import {
  canEditProject,
  canReteamProject,
  canArchiveProject,
} from '@/lib/permissions';
import { route, requireSession, parseBody, forbidden } from '@/lib/api';

export const runtime = 'nodejs';

const patchProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name cannot be blank').optional(),
  description: z.string().nullable().optional(),
  team: z.string().nullable().optional(),
});

// PATCH /api/tickets/projects/[projectId]
// Body: { name?, description?, team? }
// Any authenticated user can edit name/description. Only lead/admin can re-team.
export const PATCH = route(async (req: Request, { params }: { params: Promise<{ projectId: string }> }) => {
  const session = await requireSession();
  if (!canEditProject(session)) {
    throw forbidden();
  }

  const body = await parseBody(req, patchProjectSchema);

  if (body.team !== undefined && !canReteamProject(session)) {
    throw forbidden('Only leads/admins can change a project team');
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
});

// DELETE /api/tickets/projects/[projectId]  — soft-delete (archive). Lead/admin only.
export const DELETE = route(async (_req: Request, { params }: { params: Promise<{ projectId: string }> }) => {
  const session = await requireSession();
  if (!canArchiveProject(session)) {
    throw forbidden('Only leads/admins can archive a project');
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
});
