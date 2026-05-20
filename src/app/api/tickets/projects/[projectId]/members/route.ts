import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getProjectMembers, addProjectMember } from '@/lib/tickets';
import { canViewProject, canManageProject } from '@/lib/permissions';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { projectId } = await params;
  if (!(await canViewProject(session, Number(projectId)))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json(await getProjectMembers(projectId));
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canManageProject(session)) {
    return NextResponse.json({ error: 'Lead+ only' }, { status: 403 });
  }

  let body: { userId?: number; role?: string } = {};
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const { projectId } = await params;
  if (!body.userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

  try {
    await addProjectMember(projectId, body.userId, body.role ?? 'member');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
}
