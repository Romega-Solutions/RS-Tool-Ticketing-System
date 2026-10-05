'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';
import { hasToolAccess } from '@/lib/rbac';
import { sanitizeRichText, isRichTextEmpty } from '@/lib/sanitize';
import { removeResearchCover } from '@/lib/storage';
import {
  slugifyTitle, isValidSlug, publishBlockers, MAX_SUMMARY_LENGTH, type ResearchPost,
} from '@/lib/research-posts';

// Only paths minted by uploadResearchCover() — never an arbitrary bucket path.
const COVER_PATH = /^covers\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/;

async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  if (!hasToolAccess('research', session.role, session.toolAccess)) {
    throw new Error('Not authorized');
  }
  return session;
}

function readPostFields(formData: FormData) {
  const title      = String(formData.get('title') ?? '').trim();
  const slugRaw    = String(formData.get('slug') ?? '').trim().toLowerCase();
  const summary    = String(formData.get('summary') ?? '').trim().slice(0, MAX_SUMMARY_LENGTH) || null;
  const authorName = String(formData.get('authorName') ?? '').trim() || null;

  const coverRaw = String(formData.get('coverImagePath') ?? '').trim();
  const coverImagePath = COVER_PATH.test(coverRaw) ? coverRaw : null;

  const rawBody = String(formData.get('body') ?? '');
  const bodyIsEmpty = isRichTextEmpty(rawBody);
  const bodyHtml = bodyIsEmpty ? '' : sanitizeRichText(rawBody);

  return { title, slugRaw, summary, authorName, coverImagePath, bodyHtml, bodyIsEmpty };
}

async function getPost(id: number): Promise<ResearchPost> {
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('research_posts').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to load post: ${error.message}`);
  if (!data) throw new Error('Post not found');
  return data as ResearchPost;
}

function friendlyWriteError(message: string, code?: string): Error {
  if (code === '23505') return new Error('That URL slug is already used by another post. Pick a different one.');
  return new Error(`Failed to save post: ${message}`);
}

function revalidateResearch(id?: number) {
  revalidatePath('/research');
  if (id) revalidatePath(`/research/${id}/edit`);
}

/** Create (id = null) or update a post. Returns the post id. Publishing state is
 *  unchanged here — see setPostPublished — but a post that's already live must
 *  stay publishable, so saving can't blank out a field the website relies on. */
export async function saveResearchPost(id: number | null, formData: FormData): Promise<number> {
  const session = await requireSession();
  const f = readPostFields(formData);
  if (!f.title) throw new Error('Title is required');

  const supabase = createAdminClient();

  if (id == null) {
    const slug = f.slugRaw || slugifyTitle(f.title);
    if (!isValidSlug(slug)) throw new Error('URL slug can only contain lowercase letters, numbers, and hyphens.');

    const { data, error } = await supabase
      .from('research_posts')
      .insert({
        title:            f.title,
        slug,
        summary:          f.summary,
        cover_image_path: f.coverImagePath,
        body_html:        f.bodyHtml,
        author_id:        session.id,
        author_name:      f.authorName ?? session.name,
        created_by:       session.id,
        updated_by:       session.id,
      })
      .select('id')
      .single();
    if (error) throw friendlyWriteError(error.message, error.code);

    revalidateResearch();
    return Number(data.id);
  }

  const existing = await getPost(id);
  // The slug is the public URL; once a post has ever been published it's locked
  // so shared links and search results never break.
  const slug = existing.published_at ? existing.slug : (f.slugRaw || slugifyTitle(f.title));
  if (!isValidSlug(slug)) throw new Error('URL slug can only contain lowercase letters, numbers, and hyphens.');

  if (existing.published) {
    const missing = publishBlockers({ ...f, slug, cover_image_path: f.coverImagePath });
    if (missing.length) {
      throw new Error(`This post is live, so it still needs: ${missing.join(', ')}. Unpublish it first to save it incomplete.`);
    }
  }

  const { error } = await supabase
    .from('research_posts')
    .update({
      title:            f.title,
      slug,
      summary:          f.summary,
      cover_image_path: f.coverImagePath,
      body_html:        f.bodyHtml,
      author_name:      f.authorName ?? existing.author_name,
      updated_by:       session.id,
      updated_at:       new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw friendlyWriteError(error.message, error.code);

  if (existing.cover_image_path && existing.cover_image_path !== f.coverImagePath) {
    await removeResearchCover(existing.cover_image_path);
  }

  revalidateResearch(id);
  return id;
}

export async function setResearchPostPublished(id: number, publish: boolean) {
  const session = await requireSession();
  const post = await getPost(id);

  if (publish) {
    const missing = publishBlockers({ ...post, bodyIsEmpty: isRichTextEmpty(post.body_html) });
    if (missing.length) throw new Error(`Add a ${missing.join(', ')} before publishing.`);
  }

  const now = new Date().toISOString();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('research_posts')
    .update({
      published:    publish,
      // First publish stamps the date; unpublish/republish keeps it so the
      // post doesn't jump to the top of the website listing.
      published_at: publish ? (post.published_at ?? now) : post.published_at,
      updated_by:   session.id,
      updated_at:   now,
    })
    .eq('id', id);
  if (error) throw new Error(`Failed to update post: ${error.message}`);

  revalidateResearch(id);
}

export async function deleteResearchPost(id: number) {
  await requireSession();
  const post = await getPost(id);

  const supabase = createAdminClient();
  const { error } = await supabase.from('research_posts').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete post: ${error.message}`);

  if (post.cover_image_path) await removeResearchCover(post.cover_image_path);
  revalidateResearch();
}
