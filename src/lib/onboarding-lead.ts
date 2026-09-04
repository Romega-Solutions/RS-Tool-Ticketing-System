import { createAdminClient } from '@/lib/supabase/admin';

export type OnboardingLeadOption = {
  id: number;
  name: string;
};

export type GlobalOnboardingLeadSetting = {
  available: boolean;
  lead: OnboardingLeadOption | null;
  updatedAt: string | null;
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
  return active && ['lead', 'admin', 'founder', 'ceo'].includes(role);
}

function isMissingSettingsTable(message: string | undefined): boolean {
  const normalized = String(message ?? '').toLowerCase();
  return normalized.includes('onboarding_settings')
    && (normalized.includes('does not exist') || normalized.includes('schema cache'));
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

/** Reads the one lead used for all active onboarding records. */
export async function getGlobalOnboardingLeadSetting(): Promise<GlobalOnboardingLeadSetting> {
  const supabase = createAdminClient();
  const { data: setting, error } = await supabase
    .from('onboarding_settings')
    .select('onboarding_lead_user_id, updated_at')
    .eq('id', 1)
    .maybeSingle();
  if (error) {
    if (isMissingSettingsTable(error.message)) {
      return { available: false, lead: null, updatedAt: null };
    }
    throw new Error(`Failed to load onboarding settings: ${error.message}`);
  }
  if (!setting?.onboarding_lead_user_id) {
    return { available: true, lead: null, updatedAt: setting?.updated_at ?? null };
  }

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, name, role, is_active')
    .eq('id', setting.onboarding_lead_user_id)
    .maybeSingle();
  if (userError) throw new Error(`Failed to load the global onboarding lead: ${userError.message}`);

  return {
    available: true,
    lead: user && isEligibleLead(user as LeadUserRow)
      ? { id: Number(user.id), name: user.name }
      : null,
    updatedAt: setting.updated_at ?? null,
  };
}

export async function getRequiredGlobalOnboardingLead(): Promise<OnboardingLeadOption> {
  const setting = await getGlobalOnboardingLeadSetting();
  if (!setting.available) {
    throw new Error('Apply the global onboarding lead database migration first');
  }
  if (!setting.lead) {
    throw new Error('Configure the global Onboarding Lead in Setup & workflows first');
  }
  return setting.lead;
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
