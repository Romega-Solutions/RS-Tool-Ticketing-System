import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkItemDetail, getComments, createComment, logActivity, getProjectMembers, getProjectName } from '@/lib/tickets';
import { canCommentOnProject, canViewProject } from '@/lib/permissions';
import { notifyMention } from '@/lib/notifications';
import { route, requireSession, parseBody, badRequest, forbidden, notFound } from '@/lib/api';

export const runtime = 'nodejs';

const commentSchema = z.object({
  body:     z.string().nullable().optional(),
  mentions: z.array(z.number().int().positive()).optional(),
});

export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireSession();
  const { id } = await params;
  const detail = await getWorkItemDetail(id);
  if (!detail) throw notFound();
  if (!(await canViewProject(session, detail.project_id))) {
    throw forbidden();
  }
  return NextResponse.json(await getComments(id));
});

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requireSession();

  const { id } = await params;
  const detail = await getWorkItemDetail(id);
  if (!detail) throw notFound();
  if (!(await canCommentOnProject(session, detail.project_id))) {
    throw forbidden();
  }

  const body = await parseBody(req, commentSchema);

  const trimmed = (body.body ?? '').trim();
  if (!trimmed) throw badRequest('body is required');

  try {
    const created = await createComment(id, session.id, trimmed);
    await logActivity(Number(id), session.id, 'commented', null, trimmed.slice(0, 80));

    // Notify tagged teammates (must be project members; never notify self).
    const mentionIds = [...new Set(body.mentions ?? [])];
    if (mentionIds.length) {
      const members = await getProjectMembers(String(detail.project_id));
      const memberIds = new Set(members.map(m => m.user_id));
      const recipients = mentionIds.filter(uid => uid !== session.id && memberIds.has(uid));
      if (recipients.length) {
        const projectName = await getProjectName(detail.project_id);
        await notifyMention({
          recipientIds: recipients,
          actorId:      session.id,
          actorName:    session.name,
          projectName,
          snippet:      trimmed.slice(0, 120),
          link:         `/projects/${detail.project_id}`,
        });
      }
    }

    return NextResponse.json(created);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});
