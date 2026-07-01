import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { deleteLabel } from '@/lib/tickets';
import { canManageProject } from '@/lib/permissions';
import { route, requireSession, forbidden } from '@/lib/api';
import { projectLabelsTag } from '@/lib/cache-tags';

export const runtime = 'nodejs';

type LabelCtx = { params: Promise<{ projectId: string; labelId: string }> };

export const DELETE = route(async (_req: Request, ctx: LabelCtx) => {
  const session = await requireSession();
  const { projectId, labelId } = await ctx.params;
  if (!(await canManageProject(session, Number(projectId)))) {
    throw forbidden('Lead+ only');
  }

  try {
    await deleteLabel(labelId);
    revalidateTag(projectLabelsTag(projectId));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});
