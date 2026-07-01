import { NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidateTag } from 'next/cache';
import { getCycles, createCycle } from '@/lib/tickets';
import { canViewProject, canManageProject } from '@/lib/permissions';
import { route, requireSession, parseBody, badRequest, forbidden } from '@/lib/api';
import { projectCyclesTag } from '@/lib/cache-tags';

export const runtime = 'nodejs';

const cycleSchema = z.object({
  name: z.string().nullable().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const GET = route(async (_req: Request, { params }: { params: Promise<{ projectId: string }> }) => {
  const session = await requireSession();
  const { projectId } = await params;
  if (!(await canViewProject(session, Number(projectId)))) {
    throw forbidden();
  }
  return NextResponse.json(await getCycles(projectId));
});

export const POST = route(async (req: Request, { params }: { params: Promise<{ projectId: string }> }) => {
  const session = await requireSession();
  const { projectId } = await params;
  if (!(await canManageProject(session, Number(projectId)))) {
    throw forbidden('Lead+ only');
  }

  const body = await parseBody(req, cycleSchema);

  const name = (body.name ?? '').trim();
  if (!name || !body.startDate || !body.endDate) {
    throw badRequest('name, startDate, endDate required');
  }

  try {
    const cycle = await createCycle(projectId, name, body.startDate, body.endDate);
    revalidateTag(projectCyclesTag(projectId));
    return NextResponse.json(cycle);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});
