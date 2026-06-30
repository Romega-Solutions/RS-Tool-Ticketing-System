import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkItemDetail, getComments, createComment, logActivity, getProjectMembers, getProjectName } from '@/lib/tickets';
import { canCommentOnProject, canViewProject } from '@/lib/permissions';
import { notifyMention } from '@/lib/notifications';
import { sanitizeRichText, isRichTextEmpty } from '@/lib/sanitize';
import { route, requireSession, parseBody, badRequest, forbidden, notFound } from '@/lib/api';

export const runtime = 'nodejs';

const commentSchema = z.object({
  // Now rich-text HTML from the shared editor. `mentions` is accepted for
  // backward-compat with the old plain-text client but is no longer trusted —
  // recipients are derived from the @mention nodes in the HTML (see below).
  body:     z.string().nullable().optional(),
  mentions: z.array(z.number().int().positive()).optional(),
});

/**
 * Pull the mentioned user ids out of submitted comment HTML.
 *
 * The Tiptap Mention extension serializes each mention as
 * `<span data-type="mention" data-id="123" data-label="…">@Name</span>`.
 * We scan every span, keep the ones tagged `data-type="mention"`, and read their
 * `data-id`. Robust to attribute order and quote style. Run this on the RAW HTML
 * *before* sanitizing — `sanitizeRichText` strips the `data-*` attributes.
 *
 * Pure function (no I/O) so it can be unit-tested directly.
 */
export function extractMentionUserIds(html: string | null | undefined): number[] {
  if (!html) return [];
  const ids = new Set<number>();
  const spanRe = /<span\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = spanRe.exec(html)) !== null) {
    const attrs = m[1];
    if (!/data-type\s*=\s*["']mention["']/i.test(attrs)) continue;
    const idMatch = attrs.match(/data-id\s*=\s*["'](\d+)["']/i);
    if (!idMatch) continue;
    const id = Number(idMatch[1]);
    if (Number.isInteger(id) && id > 0) ids.add(id);
  }
  return [...ids];
}

// Strip tags to a readable plain-text snippet for the activity log + email.
function toPlainText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

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

  // Resolve mentions from the HTML BEFORE sanitizing (sanitize drops data-id),
  // then store the sanitized HTML.
  const mentionIds = extractMentionUserIds(rawHtml);
  const cleanHtml = sanitizeRichText(rawHtml);
  const plain = toPlainText(cleanHtml);

  try {
    const created = await createComment(id, session.id, cleanHtml);
    await logActivity(Number(id), session.id, 'commented', null, plain.slice(0, 80));

    // Notify tagged teammates (must be project members; never notify self).
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
          snippet:      plain.slice(0, 120),
          // Deep-link straight to the task and the exact comment they were tagged
          // in (the board reads ?task / ?comment to open the sheet and scroll).
          // Link shape is consumed by the email layer — do NOT change it.
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
