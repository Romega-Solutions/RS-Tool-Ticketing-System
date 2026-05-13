'use server';

import { revalidatePath } from 'next/cache';
import { generateStatusDraft, currentWeekStartPht } from '@/lib/status-drafter';
import { getSession } from '@/lib/session';
import { canAccessLeadTool } from '@/lib/rbac';
import { createAdminClient } from '@/lib/supabase/admin';

export async function regenerateCurrentWeekStatusDraft() {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  if (!canAccessLeadTool('pm', session.role, session.team)) {
    throw new Error('Not authorized');
  }

  const weekStart = currentWeekStartPht();
  const { draft, fromCache } = await generateStatusDraft({
    weekStart,
    force: true,
    generatedBy: session.id,
  });

  revalidatePath('/pm/status-drafter');
  return {
    ok: true,
    weekStart: draft.week_start,
    fromCache,
    hasDraft: !!draft.draft,
  };
}

const DELETE_STATUS_DRAFTS_CONFIRMATION = 'DELETE STATUS DRAFTS';

export async function deleteAllStatusDrafts(confirmation: string) {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  if (!canAccessLeadTool('pm', session.role, session.team)) {
    throw new Error('Not authorized');
  }
  if (confirmation !== DELETE_STATUS_DRAFTS_CONFIRMATION) {
    throw new Error(`Type ${DELETE_STATUS_DRAFTS_CONFIRMATION} to confirm`);
  }

  const supabase = createAdminClient();
  const { data, error: fetchError } = await supabase.from('status_drafts').select('id');
  if (fetchError) throw new Error(`Failed to inspect status drafts: ${fetchError.message}`);

  const ids = (data ?? []).map(row => row.id).filter((id): id is number => Number.isInteger(id));
  if (ids.length > 0) {
    const { error } = await supabase.from('status_drafts').delete().in('id', ids);
    if (error) throw new Error(`Failed to delete status drafts: ${error.message}`);
  }

  revalidatePath('/pm/status-drafter');
  return { ok: true as const, deleted: ids.length };
}
