import { NextResponse } from 'next/server';
import { z } from 'zod';
import { updateCycle, deleteCycle } from '@/lib/tickets';
import { canManageProject } from '@/lib/permissions';
import { route, requireSession, parseBody, forbidden } from '@/lib/api';

export const runtime = 'nodejs';

type CycleCtx = { params: Promise<{ projectId: string; cycleId: string }> };

const patchCycleSchema = z.object({
  name: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  archived: z.number().optional(),
});

export const PATCH = route(async (req: Request, ctx: CycleCtx) => {
  const session = await requireSession();
  if (!canManageProject(session)) {
    throw forbidden('Lead+ only');
  }

  const body = await parseBody(req, patchCycleSchema);

  const { cycleId } = await ctx.params;
  try {
    await updateCycle(cycleId, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});

export const DELETE = route(async (_req: Request, ctx: CycleCtx) => {
  const session = await requireSession();
  if (!canManageProject(session)) {
    throw forbidden('Lead+ only');
  }
  const { cycleId } = await ctx.params;
  try {
    await deleteCycle(cycleId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});
