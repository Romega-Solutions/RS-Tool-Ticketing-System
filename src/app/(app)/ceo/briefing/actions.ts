'use server';

import { revalidatePath } from 'next/cache';
import { generateBriefing, yesterdayPht } from '@/lib/briefing';
import { getSession } from '@/lib/session';
import { canAccessLeadTool } from '@/lib/rbac';
import { createAdminClient } from '@/lib/supabase/admin';

export async function regenerateTodaysBriefing() {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  if (!canAccessLeadTool('ceo', session.role, session.team)) {
    throw new Error('Not authorized');
  }

  const dateYmd = yesterdayPht();
  const { briefing, fromCache } = await generateBriefing({
    dateYmd,
    force:       true,
    generatedBy: session.id,
  });

  revalidatePath('/ceo/briefing');
  return {
    ok:         true,
    date:       briefing.date,
    fromCache,
    hasNarrative: !!briefing.narrative,
  };
}

const DELETE_BRIEFINGS_CONFIRMATION = 'DELETE BRIEFINGS';

export async function deleteAllBriefings(confirmation: string) {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  if (!canAccessLeadTool('ceo', session.role, session.team)) {
    throw new Error('Not authorized');
  }
  if (confirmation !== DELETE_BRIEFINGS_CONFIRMATION) {
    throw new Error(`Type ${DELETE_BRIEFINGS_CONFIRMATION} to confirm`);
  }

  const supabase = createAdminClient();
  const { data, error: fetchError } = await supabase.from('briefings').select('id');
  if (fetchError) throw new Error(`Failed to inspect briefings: ${fetchError.message}`);

  const ids = (data ?? []).map(row => row.id).filter((id): id is number => Number.isInteger(id));
  if (ids.length > 0) {
    const { error } = await supabase.from('briefings').delete().in('id', ids);
    if (error) throw new Error(`Failed to delete briefings: ${error.message}`);
  }

  revalidatePath('/ceo/briefing');
  return { ok: true as const, deleted: ids.length };
}
