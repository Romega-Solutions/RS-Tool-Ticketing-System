// Server-only helpers that bridge the ATS (`candidates`) and the Internal
// Onboarding module (`onboarders`). Called from
// src/app/(app)/recruiting/candidates/actions.ts when a candidate flips to
// `hired`, and from a backfill button on the candidate detail page when the
// hire pre-dates this bridge.
//
// Idempotent: if an onboarder row already exists for the candidate_id, the
// helper returns the existing id and does NOT insert a duplicate.

import { createAdminClient } from '@/lib/supabase/admin';
import { getRequiredGlobalOnboardingLead, type OnboardingLeadOption } from '@/lib/onboarding-lead';

export type CreateOnboarderFromCandidateResult =
  | { ok: true;  onboarderId: number; created: boolean }
  | { ok: false; error: string };

export async function createOnboarderFromCandidate(
  candidateId: number,
  opts: { actorUserId?: number | null; actorName?: string | null } = {},
): Promise<CreateOnboarderFromCandidateResult> {
  if (!Number.isInteger(candidateId) || candidateId <= 0) {
    return { ok: false, error: 'Invalid candidate id' };
  }

  const supabase = createAdminClient();

  // Idempotency check — never duplicate.
  const { data: existing, error: existingErr } = await supabase
    .from('onboarders')
    .select('id')
    .eq('candidate_id', candidateId)
    .maybeSingle();
  if (existingErr && !isTableMissing(existingErr.message)) {
    return { ok: false, error: `Lookup failed: ${existingErr.message}` };
  }
  if (existing?.id) {
    return { ok: true, onboarderId: existing.id, created: false };
  }

  const { data: candidate, error: candidateErr } = await supabase
    .from('candidates')
    .select('id, full_name, email, phone, position')
    .eq('id', candidateId)
    .maybeSingle();
  if (candidateErr) return { ok: false, error: `Candidate lookup failed: ${candidateErr.message}` };
  if (!candidate)   return { ok: false, error: 'Candidate not found' };

  if (!candidate.email) {
    return { ok: false, error: 'Candidate has no email — cannot create onboarder' };
  }

  // Role title comes from the denormalized `position` text on the candidate
  // row. Team is left null — the Onboarding Lead fills it on the detail page.
  const roleTitle: string | null = candidate.position ?? null;
  const team:      string | null = null;
  let onboardingLead: OnboardingLeadOption;
  try {
    onboardingLead = await getRequiredGlobalOnboardingLead();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Global Onboarding Lead is not configured' };
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('onboarders')
    .insert({
      candidate_id:    candidateId,
      full_name:       candidate.full_name,
      personal_email:  candidate.email,
      phone:           candidate.phone ?? null,
      onboarder_type:  'contractor', // Lead can flip to intern on detail page
      role_title:      roleTitle,
      team,
      onboarding_lead: onboardingLead.name,
      onboarding_lead_id: onboardingLead.id,
      status:          'pre_onboarding',
      created_by:      opts.actorUserId ?? null,
    })
    .select('id')
    .single();
  if (insertErr || !inserted) {
    return { ok: false, error: `Insert failed: ${insertErr?.message ?? 'unknown'}` };
  }

  await supabase.from('onboarder_history').insert({
    onboarder_id: inserted.id,
    user_id:      opts.actorUserId ?? null,
    user_name:    opts.actorName ?? 'ATS auto-promotion',
    field:        'created',
    old_value:    null,
    new_value:    candidate.full_name,
    summary:      `Created from ATS hire (candidate #${candidateId}) at stage 'pre_onboarding' — Lead: ${onboardingLead.name}`,
  });

  return { ok: true, onboarderId: inserted.id, created: true };
}

function isTableMissing(msg: string | undefined): boolean {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return m.includes('relation') && m.includes('does not exist');
}
