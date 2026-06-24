import { NextResponse } from 'next/server';
import { z } from 'zod';
import { addProjectMember, removeProjectMember } from '@/lib/tickets';
import { canManageProject } from '@/lib/permissions';
import { route, requireSession, parseBody, forbidden } from '@/lib/api';

export const runtime = 'nodejs';

type MemberCtx = { params: Promise<{ projectId: string; userId: string }> };

const roleSchema = z.object({
  role: z.enum(['viewer', 'member', 'lead']),
});

// PATCH /api/tickets/projects/[projectId]/members/[userId]  — change a member's
// project role (addProjectMember upserts on conflict). Project lead / admin only.
export const PATCH = route(async (req: Request, ctx: MemberCtx) => {
  const session = await requireSession();
  const { projectId, userId } = await ctx.params;
  if (!(await canManageProject(session, Number(projectId)))) {
    throw forbidden('Lead+ only');
  }

  const { role } = await parseBody(req, roleSchema);
  try {
    await addProjectMember(projectId, Number(userId), role);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});

// DELETE /api/tickets/projects/[projectId]/members/[userId]  — remove a member.
export const DELETE = route(async (_req: Request, ctx: MemberCtx) => {
  const session = await requireSession();
  const { projectId, userId } = await ctx.params;
  if (!(await canManageProject(session, Number(projectId)))) {
    throw forbidden('Lead+ only');
  }

  try {
    await removeProjectMember(projectId, Number(userId));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});
