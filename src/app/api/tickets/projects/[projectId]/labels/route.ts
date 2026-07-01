import { NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidateTag } from 'next/cache';
import { getLabels, createLabel } from '@/lib/tickets';
import { canViewProject, canManageProject } from '@/lib/permissions';
import { route, requireSession, parseBody, badRequest, forbidden } from '@/lib/api';
import { projectLabelsTag } from '@/lib/cache-tags';

export const runtime = 'nodejs';

const labelSchema = z.object({
  name: z.string().nullable().optional(),
  color: z.string().optional(),
});

export const GET = route(async (_req: Request, { params }: { params: Promise<{ projectId: string }> }) => {
  const session = await requireSession();
  const { projectId } = await params;
  if (!(await canViewProject(session, Number(projectId)))) {
    throw forbidden();
  }
  return NextResponse.json(await getLabels(projectId));
});

export const POST = route(async (req: Request, { params }: { params: Promise<{ projectId: string }> }) => {
  const session = await requireSession();
  const { projectId } = await params;
  if (!(await canManageProject(session, Number(projectId)))) {
    throw forbidden('Lead+ only');
  }

  const body = await parseBody(req, labelSchema);
  const name = (body.name ?? '').trim();
  if (!name) throw badRequest('name is required');

  try {
    const label = await createLabel(projectId, name, body.color ?? '#6b7280');
    revalidateTag(projectLabelsTag(projectId));
    return NextResponse.json(label);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});
