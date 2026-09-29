import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getLinks, getLink, createLink, deleteLink, getWorkItemDetail, logActivity } from '@/lib/tickets';
import { canEditWorkItem, canViewProject } from '@/lib/permissions';
import { encodeLinkActivity, normalizeLinkUrl, LINK_TITLE_MAX, LINK_URL_MAX } from '@/lib/work-item-links';
import { route, requireSession, parseBody, badRequest, forbidden, notFound } from '@/lib/api';

export const runtime = 'nodejs';

const linkSchema = z.object({
  title: z.string().max(LINK_TITLE_MAX).optional().default(''),
  url: z.string().min(1).max(LINK_URL_MAX),
});

// GET — the task's related links, oldest first
export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireSession();

  const { id } = await params;
  const detail = await getWorkItemDetail(id);
  if (!detail) throw notFound();
  if (!(await canViewProject(session, detail.project_id))) {
    throw forbidden();
  }
  return NextResponse.json(await getLinks(id));
});

// POST { title?, url } — add a related link (logged as link_added activity)
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireSession();

  const { id } = await params;
  const detail = await getWorkItemDetail(id);
  if (!detail) throw notFound();
  if (!(await canEditWorkItem(session, { id: detail.id, projectId: detail.project_id }))) {
    throw forbidden();
  }

  const body = await parseBody(req, linkSchema);
  const url = normalizeLinkUrl(body.url);
  if (!url) throw badRequest('Enter a valid http(s) URL');
  const title = body.title.trim();

  const link = await createLink(id, session.id, title, url);
  await logActivity(Number(id), session.id, 'link_added', null, encodeLinkActivity(link));
  return NextResponse.json(link, { status: 201 });
});

// DELETE ?linkId= — remove a related link (logged as link_removed activity)
export const DELETE = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireSession();

  const { id } = await params;
  const detail = await getWorkItemDetail(id);
  if (!detail) throw notFound();
  if (!(await canEditWorkItem(session, { id: detail.id, projectId: detail.project_id }))) {
    throw forbidden();
  }

  const linkId = Number(new URL(req.url).searchParams.get('linkId'));
  if (!Number.isInteger(linkId) || linkId <= 0) throw badRequest('linkId required');
  const link = await getLink(linkId);
  if (!link || String(link.work_item_id) !== String(detail.id)) throw notFound();

  await deleteLink(linkId);
  await logActivity(Number(id), session.id, 'link_removed', encodeLinkActivity(link), null);
  return NextResponse.json({ ok: true });
});
