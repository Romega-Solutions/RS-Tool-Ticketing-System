import { createAdminClient } from '@/lib/supabase/admin';

export type OnboardingLeadOption = {
  id: number;
  name: string;
};

type LeadUserRow = {
  id: number;
  name: string;
  role: string;
  is_active: number | boolean | null;
};

function isEligibleLead(user: LeadUserRow): boolean {
  const active = user.is_active === true || user.is_active === 1;
  const role = String(user.role ?? '').trim().toLowerCase();
  return active && ['lead', 'admin', 'founder'].includes(role);
}

/** Active Lead, Admin, and Founder users who may be assigned internally. */
export async function listOnboardingLeadOptions(): Promise<OnboardingLeadOption[]> {
  const { data, error } = await createAdminClient()
    .from('users')
    .select('id, name, role, is_active')
    .order('name', { ascending: true });
  if (error) throw new Error(`Failed to load onboarding leads: ${error.message}`);

  return ((data ?? []) as LeadUserRow[])
    .filter(isEligibleLead)
    .map(user => ({ id: Number(user.id), name: user.name }));
}

/** Returns an eligible internal lead, or null for an explicit unassignment. */
export async function resolveOnboardingLead(
  leadUserId: number | null,
): Promise<OnboardingLeadOption | null> {
  if (leadUserId == null) return null;
  if (!Number.isInteger(leadUserId) || leadUserId <= 0) {
    throw new Error('Select a valid onboarding lead');
  }
  const { data, error } = await createAdminClient()
    .from('users')
    .select('id, name, is_active')
    .eq('id', leadUserId)
    .maybeSingle();
  if (error || !data || data.is_active === false || data.is_active === 0) {
    throw new Error('Selected onboarding lead is unavailable');
  }

  const options = await listOnboardingLeadOptions();
  const lead = options.find(option => option.id === Number(data.id));
  if (!lead) throw new Error('Selected user is not eligible for this assignment');
  return lead;
}
