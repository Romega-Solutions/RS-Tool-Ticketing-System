import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { deleteLabel } from '@/lib/tickets';
import { canManageProject } from '@/lib/permissions';

export const runtime = 'nodejs';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; labelId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageProject(session)) {
    return NextResponse.json({ error: 'Lead+ only' }, { status: 403 });
  }

  const { labelId } = await params;
  try {
    await deleteLabel(labelId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
}
