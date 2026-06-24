import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getProjectMembers, addProjectMember, getProjectName } from '@/lib/tickets';
import { canViewProject, canManageProject } from '@/lib/permissions';
import { notifyProjectAdded } from '@/lib/notifications';
import { route, requireSession, parseBody, badRequest, forbidden } from '@/lib/api';

export const runtime = 'nodejs';

const memberSchema = z.object({
  userId: z.number().int().positive().optional(),
  role: z.string().optional(),
});

export const GET = route(async (_req: Request, { params }: { params: Promise<{ projectId: string }> }) => {
  const session = await requireSession();
  const { projectId } = await params;
  if (!(await canViewProject(session, Number(projectId)))) {
    throw forbidden();
  }
  return NextResponse.json(await getProjectMembers(projectId));
});

export const POST = route(async (req: Request, { params }: { params: Promise<{ projectId: string }> }) => {
  const session = await requireSession();
  const { projectId } = await params;
  if (!(await canManageProject(session, Number(projectId)))) {
    throw forbidden('Lead+ only');
  }

  const body = await parseBody(req, memberSchema);

  if (!body.userId) throw badRequest('userId is required');

  try {
    await addProjectMember(projectId, body.userId, body.role ?? 'member');
    // Let the added teammate know (skip if a lead added themselves).
    if (body.userId !== session.id) {
      const projectName = await getProjectName(projectId);
      await notifyProjectAdded({
        recipientId: body.userId,
        actorId:     session.id,
        actorName:   session.name,
        projectName,
        projectId,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});
