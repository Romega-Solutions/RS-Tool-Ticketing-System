import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getProjectComments, createProjectComment, getProjectMembers, getProjectName } from '@/lib/tickets';
import { canCommentOnProject, canViewProject } from '@/lib/permissions';
import { notifyMention } from '@/lib/notifications';
import { sanitizeRichText, isRichTextEmpty } from '@/lib/sanitize';
import { extractMentionUserIds, toPlainText } from '@/lib/mentions';
import { route, requireSession, parseBody, badRequest, forbidden } from '@/lib/api';

export const runtime = 'nodejs';

const commentSchema = z.object({
  body: z.string().nullable().optional(),
});

export const GET = route(async (_req: Request, { params }: { params: Promise<{ projectId: string }> }) => {
  const session = await requireSession();
  const { projectId } = await params;
  if (!(await canViewProject(session, Number(projectId)))) {
    throw forbidden();
  }
  return NextResponse.json(await getProjectComments(projectId));
});

export const POST = route(async (req: Request, { params }: { params: Promise<{ projectId: string }> }) => {
  const session = await requireSession();
  const { projectId } = await params;
  if (!(await canCommentOnProject(session, Number(projectId)))) {
    throw forbidden();
  }

  const body = await parseBody(req, commentSchema);

  const rawHtml = body.body ?? '';
  if (isRichTextEmpty(rawHtml)) throw badRequest('body is required');

  // Resolve mentions from the HTML BEFORE sanitizing (sanitize drops data-id),
  // then store the sanitized HTML.
  const mentionIds = extractMentionUserIds(rawHtml);
  const cleanHtml = sanitizeRichText(rawHtml);
  const plain = toPlainText(cleanHtml);

  try {
    const created = await createProjectComment(projectId, session.id, cleanHtml);

    // Notify tagged teammates (must be project members; never notify self).
    if (mentionIds.length) {
      const members = await getProjectMembers(projectId);
      const memberIds = new Set(members.map(m => m.user_id));
      const recipients = mentionIds.filter(uid => uid !== session.id && memberIds.has(uid));
      if (recipients.length) {
        const projectName = await getProjectName(Number(projectId));
        await notifyMention({
          recipientIds: recipients,
          actorId:      session.id,
          actorName:    session.name,
          projectName,
          snippet:      plain.slice(0, 120),
          // Deep-link straight to the project discussion page and the exact
          // comment they were tagged in.
          link:         `/projects/${projectId}/discussion?comment=${created.id}`,
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
