import { NextResponse } from 'next/server';
import { getActivity, getWorkItemDetail } from '@/lib/tickets';
import { canViewProject } from '@/lib/permissions';
import { route, requireSession, forbidden, notFound } from '@/lib/api';

export const runtime = 'nodejs';

export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireSession();

  const { id } = await params;
  const detail = await getWorkItemDetail(id);
  if (!detail) throw notFound();
  if (!(await canViewProject(session, detail.project_id))) {
    throw forbidden();
  }
  return NextResponse.json(await getActivity(id));
});
