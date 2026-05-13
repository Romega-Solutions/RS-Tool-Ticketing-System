'use server';

import { revalidatePath } from 'next/cache';
import { createContentDraft } from '@/lib/content-repurposer';
import { getSession } from '@/lib/session';
import { canAccessLeadTool } from '@/lib/rbac';
import { createAdminClient } from '@/lib/supabase/admin';

export async function generateContentDraftAction(input: {
  sourceTitle: string;
  sourceType: string;
  sourceContent: string;
}) {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  if (!canAccessLeadTool('marketing', session.role, session.team)) {
    throw new Error('Not authorized');
  }

  if (!input.sourceTitle.trim()) throw new Error('Source title is required');
  if (input.sourceContent.trim().length < 80) {
    throw new Error('Source content is too short to repurpose');
  }

  const draft = await createContentDraft({
    sourceTitle: input.sourceTitle,
    sourceType: input.sourceType,
    sourceContent: input.sourceContent,
    createdBy: session.id,
  });

  revalidatePath('/marketing/content');
  return draft;
}

const DELETE_CONTENT_DRAFTS_CONFIRMATION = 'DELETE CONTENT DRAFTS';

export async function deleteAllContentDrafts(confirmation: string) {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  if (!canAccessLeadTool('marketing', session.role, session.team)) {
    throw new Error('Not authorized');
  }
  if (confirmation !== DELETE_CONTENT_DRAFTS_CONFIRMATION) {
    throw new Error(`Type ${DELETE_CONTENT_DRAFTS_CONFIRMATION} to confirm`);
  }

  const supabase = createAdminClient();
  const { data, error: fetchError } = await supabase.from('content_drafts').select('id');
  if (fetchError) throw new Error(`Failed to inspect content drafts: ${fetchError.message}`);

  const ids = (data ?? []).map(row => row.id).filter((id): id is number => Number.isInteger(id));
  if (ids.length > 0) {
    const { error } = await supabase.from('content_drafts').delete().in('id', ids);
    if (error) throw new Error(`Failed to delete content drafts: ${error.message}`);
  }

  revalidatePath('/marketing/content');
  return { ok: true as const, deleted: ids.length };
}
