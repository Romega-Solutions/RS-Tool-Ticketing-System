import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { updateCycle, deleteCycle } from '@/lib/tickets';
import { canManageProject } from '@/lib/permissions';

export const runtime = 'nodejs';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ projectId: string; cycleId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageProject(session)) {
    return NextResponse.json({ error: 'Lead+ only' }, { status: 403 });
  }

  let body: { name?: string; startDate?: string; endDate?: string; archived?: number } = {};
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const { cycleId } = await params;
  try {
    await updateCycle(cycleId, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; cycleId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageProject(session)) {
    return NextResponse.json({ error: 'Lead+ only' }, { status: 403 });
  }
  const { cycleId } = await params;
  try {
    await deleteCycle(cycleId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
}
