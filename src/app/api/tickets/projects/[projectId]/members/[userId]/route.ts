import { NextResponse } from 'next/server';
import { removeProjectMember } from '@/lib/tickets';
import { canManageProject } from '@/lib/permissions';
import { route, requireSession, forbidden } from '@/lib/api';

export const runtime = 'nodejs';

type MemberCtx = { params: Promise<{ projectId: string; userId: string }> };

export const DELETE = route(async (_req: Request, ctx: MemberCtx) => {
  const session = await requireSession();
  if (!canManageProject(session)) {
    throw forbidden('Lead+ only');
  }

  const { projectId, userId } = await ctx.params;
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
