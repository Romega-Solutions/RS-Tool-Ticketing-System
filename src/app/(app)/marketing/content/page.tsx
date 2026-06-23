import { redirect } from 'next/navigation';
import { LeadToolHeader } from '@/components/lead-tool-header';
import { ToolResetButton } from '@/components/tool-reset-button';
import { getRecentContentDrafts } from '@/lib/content-repurposer';
import { getSession } from '@/lib/session';
import { hasToolAccess } from '@/lib/rbac';
import { ContentRepurposerClient } from './content-repurposer-client';
import { deleteAllContentDrafts } from './actions';

export default async function ContentRepurposerPage() {
  const session = await getSession();
  if (!session || !hasToolAccess('marketing', session.role, session.toolAccess)) {
    redirect('/dashboard');
  }

  const drafts = await getRecentContentDrafts(10);

  return (
    <div className="space-y-6">
      <LeadToolHeader
        eyebrow="Marketing tool"
        title="Content Repurposer"
        description="Paste one blog post, video transcript, or case study. Groq spins out a LinkedIn carousel, Twitter thread, newsletter HTML, and Instagram caption in Romega's brand voice."
        action={
          <ToolResetButton
            label="Reset content drafts"
            description="Deletes all saved marketing content draft runs from Supabase. This does not affect source files outside the content_drafts table."
            confirmationText="DELETE CONTENT DRAFTS"
            action={deleteAllContentDrafts}
          />
        }
      />

      <ContentRepurposerClient initialDrafts={drafts} />
    </div>
  );
}
