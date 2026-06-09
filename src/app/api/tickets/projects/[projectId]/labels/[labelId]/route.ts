import { NextResponse } from 'next/server';
import { deleteLabel } from '@/lib/tickets';
import { canManageProject } from '@/lib/permissions';
import { route, requireSession, forbidden } from '@/lib/api';

export const runtime = 'nodejs';

type LabelCtx = { params: Promise<{ projectId: string; labelId: string }> };

export const DELETE = route(async (_req: Request, ctx: LabelCtx) => {
  const session = await requireSession();
  if (!canManageProject(session)) {
    throw forbidden('Lead+ only');
  }

  const { labelId } = await ctx.params;
  try {
    await deleteLabel(labelId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});
