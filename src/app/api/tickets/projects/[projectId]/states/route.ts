import { NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidateTag } from 'next/cache';
import { getProjectStates, createProjectState, reorderProjectStates, CUSTOM_STATE_GROUPS } from '@/lib/tickets';
import { canViewProject, canEditProjectColumns } from '@/lib/permissions';
import { route, requireSession, parseBody, forbidden } from '@/lib/api';
import { projectStatesTag } from '@/lib/cache-tags';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ projectId: string }> };

const createSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(40),
  group: z.enum(CUSTOM_STATE_GROUPS),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

const reorderSchema = z.object({
  order: z.array(z.string().regex(/^\d+$/)).min(1),
});

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const session = await requireSession();
  const { projectId } = await params;
  if (!(await canViewProject(session, Number(projectId)))) throw forbidden();
  return NextResponse.json(await getProjectStates(projectId));
});

export const POST = route(async (req: Request, { params }: Ctx) => {
  const session = await requireSession();
  const { projectId } = await params;
  if (!(await canEditProjectColumns(session, Number(projectId)))) throw forbidden();

  const body = await parseBody(req, createSchema);
  const state = await createProjectState(projectId, {
    name: body.name, group: body.group, color: body.color ?? '#6b7280',
  });
  revalidateTag(projectStatesTag(projectId), { expire: 0 });
  return NextResponse.json(state);
});

// Reorder: body is the full list of column ids, left to right.
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const session = await requireSession();
  const { projectId } = await params;
  if (!(await canEditProjectColumns(session, Number(projectId)))) throw forbidden();

  const { order } = await parseBody(req, reorderSchema);
  await reorderProjectStates(projectId, order);
  revalidateTag(projectStatesTag(projectId), { expire: 0 });
  return NextResponse.json({ ok: true });
});
