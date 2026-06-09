import { NextResponse } from 'next/server';
import { getChildren, getWorkItemDetail } from '@/lib/tickets';
import { canViewProject } from '@/lib/permissions';
import { route, requireSession, forbidden, notFound } from '@/lib/api';

export const runtime = 'nodejs';

export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireSession();

  const { id } = await params;
  const parent = await getWorkItemDetail(id);
  if (!parent) throw notFound();
  if (!(await canViewProject(session, parent.project_id))) {
    throw forbidden();
  }
  return NextResponse.json(await getChildren(id));
});
