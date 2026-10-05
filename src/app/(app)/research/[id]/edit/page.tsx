import { redirect, notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';
import { hasToolAccess } from '@/lib/rbac';
import { researchCoverUrl } from '@/lib/research-posts';
import { PostEditor } from '../../post-editor.client';

export default async function EditResearchPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || !hasToolAccess('research', session.role, session.toolAccess)) {
    redirect('/dashboard');
  }

  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('research_posts')
    .select('title, slug, summary, author_name, cover_image_path, body_html, published, published_at')
    .eq('id', id)
    .maybeSingle();
  if (!data) notFound();

  return (
    <PostEditor
      // Remount on publish/unpublish so the status-dependent defaults refresh.
      key={`${id}-${data.published}`}
      mode="edit"
      postId={id}
      defaultAuthorName={session.name}
      defaults={{
        title:            data.title,
        slug:             data.slug,
        summary:          data.summary,
        author_name:      data.author_name,
        cover_image_path: data.cover_image_path,
        cover_url:        researchCoverUrl(data.cover_image_path),
        body_html:        data.body_html,
        published:        data.published,
        slug_locked:      data.published_at != null,
      }}
    />
  );
}
