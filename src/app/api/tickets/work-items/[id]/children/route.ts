import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getChildren, getWorkItemDetail } from '@/lib/tickets';
import { canViewProject } from '@/lib/permissions';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const parent = await getWorkItemDetail(id);
  if (!parent) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await canViewProject(session, parent.project_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json(await getChildren(id));
}
