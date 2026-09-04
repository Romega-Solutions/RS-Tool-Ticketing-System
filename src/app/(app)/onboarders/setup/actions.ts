'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOnboardingLead } from '@/lib/onboarding-lead';

export async function updateGlobalOnboardingLead(leadUserId: number): Promise<number> {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  if (session.role !== 'admin') throw new Error('Only an Admin or Founder can change the global Onboarding Lead');
  if (!Number.isInteger(leadUserId) || leadUserId <= 0) throw new Error('Select a valid Onboarding Lead');

  const lead = await resolveOnboardingLead(leadUserId);
  if (!lead) throw new Error('Select a valid Onboarding Lead');

  const { data, error } = await createAdminClient().rpc('set_global_onboarding_lead', {
    p_lead_user_id: lead.id,
    p_updated_by: session.id,
  });
  if (error) {
    const migrationHint = error.message.toLowerCase().includes('set_global_onboarding_lead')
      ? ' Apply docs/migrations/add-global-onboarding-lead.sql first.'
      : '';
    throw new Error(`Failed to update the global Onboarding Lead: ${error.message}.${migrationHint}`);
  }

  revalidatePath('/onboarders');
  revalidatePath('/onboarders/setup');
  revalidatePath('/onboarders/[id]', 'page');
  revalidatePath('/onboarders/new');
  return typeof data === 'number' ? data : Number(data ?? 0);
}
