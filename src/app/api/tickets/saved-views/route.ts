import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSavedViews, createSavedView } from '@/lib/tickets';
import { route, requireSession, parseBody, badRequest } from '@/lib/api';

export const runtime = 'nodejs';

const savedViewSchema = z.object({
  name: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
});

export const GET = route(async (req: Request) => {
  const session = await requireSession();
  const projectId = new URL(req.url).searchParams.get('projectId');
  return NextResponse.json(await getSavedViews(session.id, projectId ?? undefined));
});

export const POST = route(async (req: Request) => {
  const session = await requireSession();

  const body = await parseBody(req, savedViewSchema);
  const name = (body.name ?? '').trim();
  if (!name || !body.filters) {
    throw badRequest('name and filters required');
  }
  try {
    return NextResponse.json(
      await createSavedView(session.id, body.projectId ?? null, name, body.filters),
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});
