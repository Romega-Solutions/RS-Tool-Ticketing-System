import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkItemDetail, getComments, getComment, createComment, logActivity, getProjectMembers, getProjectName, getThreadParticipantIds } from '@/lib/tickets';
import { canCommentOnProject, canViewProject } from '@/lib/permissions';
import { notifyMention, notifyThreadReply } from '@/lib/notifications';
import { sanitizeRichText, isRichTextEmpty } from '@/lib/sanitize';
import { extractMentionUserIds, toPlainText } from '@/lib/mentions';
import { route, requireSession, parseBody, badRequest, forbidden, notFound } from '@/lib/api';

export const runtime = 'nodejs';

const commentSchema = z.object({
  // Now rich-text HTML from the shared editor. `mentions` is accepted for
  // backward-compat with the old plain-text client but is no longer trusted —
  // recipients are derived from the @mention nodes in the HTML (see below).
  body:     z.string().nullable().optional(),
  mentions: z.array(z.number().int().positive()).optional(),
  // Reply in the thread rooted at this top-level comment (omit for a new message).
  parent_id: z.number().int().positive().nullable().optional(),
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

  const rawHtml = body.body ?? '';
  if (isRichTextEmpty(rawHtml)) throw badRequest('body is required');

  // Threads are one level deep: a reply must target a top-level comment on
  // this same task.
  const parentId = body.parent_id ?? null;
  if (parentId != null) {
    const parent = await getComment(String(parentId));
    if (!parent || parent.work_item_id !== Number(id)) throw badRequest('parent comment not found');
    if (parent.parent_id != null) throw badRequest('cannot reply to a reply');
  }

  // Resolve mentions from the HTML BEFORE sanitizing (sanitize drops data-id),
  // then store the sanitized HTML.
  const mentionIds = extractMentionUserIds(rawHtml);
  const cleanHtml = sanitizeRichText(rawHtml);
  const plain = toPlainText(cleanHtml);

  try {
    const created = await createComment(id, session.id, cleanHtml, parentId);
    await logActivity(Number(id), session.id, 'commented', null, plain.slice(0, 80));

    // Notify tagged teammates (must be project members; never notify self).
    const recipients = new Set<number>();
    let projectName: string | null = null;
    if (mentionIds.length) {
      const members = await getProjectMembers(String(detail.project_id));
      const memberIds = new Set(members.map(m => m.user_id));
      for (const uid of mentionIds) if (uid !== session.id && memberIds.has(uid)) recipients.add(uid);
      if (recipients.size) {
        projectName = await getProjectName(detail.project_id);
        await notifyMention({
          recipientIds: [...recipients],
          actorId:      session.id,
          actorName:    session.name,
          projectName,
          snippet:      plain.slice(0, 120),
          // Deep-link straight to the task and the exact comment they were tagged
          // in (the board reads ?task / ?comment to open the sheet and scroll).
          // Link shape is consumed by the email layer — do NOT change it.
          link:         `/projects/${detail.project_id}?task=${id}&comment=${created.id}`,
        });
      }
    }

    // Thread reply → ping everyone already in the thread, except the replier
    // and anyone who just got a mention notification for this same comment.
    if (parentId != null) {
      const participants = (await getThreadParticipantIds(parentId))
        .filter(uid => uid !== session.id && !recipients.has(uid));
      if (participants.length) {
        await notifyThreadReply({
          recipientIds: participants,
          actorId:      session.id,
          actorName:    session.name,
          projectName:  projectName ?? await getProjectName(detail.project_id),
          snippet:      plain.slice(0, 120),
          link:         `/projects/${detail.project_id}?task=${id}&comment=${created.id}`,
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
