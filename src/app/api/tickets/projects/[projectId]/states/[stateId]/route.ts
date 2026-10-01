import { NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidateTag } from 'next/cache';
import { updateProjectState, deleteProjectState } from '@/lib/tickets';
import { canEditProjectColumns } from '@/lib/permissions';
import { route, requireSession, parseBody, forbidden } from '@/lib/api';
import { projectStatesTag } from '@/lib/cache-tags';

export const runtime = 'nodejs';

type StateCtx = { params: Promise<{ projectId: string; stateId: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1, 'name cannot be blank').max(40).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export const PATCH = route(async (req: Request, ctx: StateCtx) => {
  const session = await requireSession();
  const { projectId, stateId } = await ctx.params;
  if (!(await canEditProjectColumns(session, Number(projectId)))) throw forbidden();

  const body = await parseBody(req, patchSchema);
  await updateProjectState(projectId, stateId, body);
  revalidateTag(projectStatesTag(projectId), { expire: 0 });
  return NextResponse.json({ ok: true });
});

export const DELETE = route(async (_req: Request, ctx: StateCtx) => {
  const session = await requireSession();
  const { projectId, stateId } = await ctx.params;
  if (!(await canEditProjectColumns(session, Number(projectId)))) throw forbidden();

  const movedTo = await deleteProjectState(projectId, stateId);
  revalidateTag(projectStatesTag(projectId), { expire: 0 });
  return NextResponse.json({ ok: true, movedTo });
});
