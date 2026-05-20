import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getSavedViews, createSavedView } from '@/lib/tickets';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const projectId = new URL(req.url).searchParams.get('projectId');
  return NextResponse.json(await getSavedViews(session.id, projectId ?? undefined));
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { name?: string; projectId?: string | null; filters?: Record<string, unknown> } = {};
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const name = (body.name ?? '').trim();
  if (!name || !body.filters) {
    return NextResponse.json({ error: 'name and filters required' }, { status: 400 });
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
}
