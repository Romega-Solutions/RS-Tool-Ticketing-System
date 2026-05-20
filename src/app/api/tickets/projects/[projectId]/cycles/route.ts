import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getCycles, createCycle } from '@/lib/tickets';
import { canViewProject, canManageProject } from '@/lib/permissions';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { projectId } = await params;
  if (!(await canViewProject(session, Number(projectId)))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json(await getCycles(projectId));
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageProject(session)) {
    return NextResponse.json({ error: 'Lead+ only' }, { status: 403 });
  }

  let body: { name?: string; startDate?: string; endDate?: string } = {};
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const name = (body.name ?? '').trim();
  if (!name || !body.startDate || !body.endDate) {
    return NextResponse.json({ error: 'name, startDate, endDate required' }, { status: 400 });
  }

  const { projectId } = await params;
  try {
    return NextResponse.json(
      await createCycle(projectId, name, body.startDate, body.endDate),
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
}
