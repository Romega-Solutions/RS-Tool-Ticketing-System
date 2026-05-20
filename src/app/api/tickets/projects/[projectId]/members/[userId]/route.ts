import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { removeProjectMember } from '@/lib/tickets';
import { canManageProject } from '@/lib/permissions';

export const runtime = 'nodejs';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; userId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageProject(session)) {
    return NextResponse.json({ error: 'Lead+ only' }, { status: 403 });
  }

  const { projectId, userId } = await params;
  try {
    await removeProjectMember(projectId, Number(userId));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
}
