import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getProjectMembers, addProjectMember } from '@/lib/tickets';
import { canViewProject, canManageProject } from '@/lib/permissions';
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
  if (!canManageProject(session)) {
    throw forbidden('Lead+ only');
  }

  const body = await parseBody(req, memberSchema);

  const { projectId } = await params;
  if (!body.userId) throw badRequest('userId is required');

  try {
    await addProjectMember(projectId, body.userId, body.role ?? 'member');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});
