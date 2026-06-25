'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession, type SessionUser } from '@/lib/session';
import {
  parseResumeWithN8n,
  notifyCommunicationWebhook,
  notifyRecruiterOfApplication,
  type ParsedResume,
  type ParsedEducation,
  type ParsedExperience,
  type CommunicationEvent,
  type CommunicationResult,
} from '@/lib/n8n';
import { hasToolAccess } from '@/lib/rbac';
import { toProperName, formatPhoneNumber } from '@/lib/format';
import { uploadResumeToStorage } from '@/lib/storage';
import { createOnboarderFromCandidate } from '@/lib/onboarders';

// SOP's 11 status stages. See docs/RECRUITMENT_AI_AGENT_BUILD_PLAN.md §2.
const ALLOWED_STATUSES = [
  'pending_response',
  'interview_romega',
  'endorsed_client',
  'final_interview',
  'offered',
  'hired',
  'failed',
  'no_show',
  'unresponsive',
  'consider_other',
  'withdrew',
] as const;
type Status = typeof ALLOWED_STATUSES[number];

function isStatus(v: string): v is Status {
  return (ALLOWED_STATUSES as readonly string[]).includes(v);
}

// Status transitions that should auto-fire the Gmail template. `pending_response`
// is NOT in here — its acknowledgment is sent on creation only, not on entry.
const AUTO_EMAIL_STATUSES: ReadonlySet<Status> = new Set<Status>([
  'interview_romega',
  'endorsed_client',
  'final_interview',
  'offered',
  'hired',
  'failed',
  'withdrew',
]);

async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  if (!hasToolAccess('recruiting', session.role, session.toolAccess)) {
    throw new Error('Not authorized');
  }
  return session;
}

// ─────────────────────────────────────────────────────────────────────────────
// History logging
// ─────────────────────────────────────────────────────────────────────────────

type AdminClient = ReturnType<typeof createAdminClient>;

type HistoryEntry = {
  field:    string;
  oldValue: string | null;
  newValue: string | null;
  summary:  string;
};

async function writeHistory(
  supabase: AdminClient,
  candidateId: number,
  session: SessionUser,
  entries: HistoryEntry[],
) {
  if (entries.length === 0) return;
  const rows = entries.map(entry => ({
    candidate_id: candidateId,
    user_id:      session.id,
    user_name:    session.name,
    field:        entry.field,
    old_value:    entry.oldValue,
    new_value:    entry.newValue,
    summary:      entry.summary,
  }));
  // Don't fail the caller if history can't be written (table may be missing
  // in older deploys). Surface via console; the row state is still correct.
  const { error } = await supabase.from('candidate_history').insert(rows);
  if (error) {
    console.warn('[ats] failed to write candidate_history:', error.message);
  }
}

function normalizeText(v: string | null | undefined): string {
  return (v ?? '').toString().trim();
}

function diffSimple(
  field: string,
  label: string,
  oldRaw: string | null | undefined,
  newRaw: string | null | undefined,
): HistoryEntry | null {
  const o = normalizeText(oldRaw);
  const n = normalizeText(newRaw);
  if (o === n) return null;
  if (!o && n) return { field, oldValue: null, newValue: n, summary: `${label} set to '${n}'` };
  if (o && !n) return { field, oldValue: o,    newValue: null, summary: `${label} cleared (was '${o}')` };
  return { field, oldValue: o, newValue: n, summary: `${label} changed from '${o}' to '${n}'` };
}

function diffJsonList<T>(
  field: string,
  label: string,
  oldList: T[] | null | undefined,
  newList: T[] | null | undefined,
): HistoryEntry | null {
  const o = JSON.stringify(oldList ?? []);
  const n = JSON.stringify(newList ?? []);
  if (o === n) return null;
  const oCount = (oldList ?? []).length;
  const nCount = (newList ?? []).length;
  return {
    field,
    oldValue: o,
    newValue: n,
    summary: oCount === nCount
      ? `${label} updated (${nCount} ${nCount === 1 ? 'entry' : 'entries'})`
      : `${label} updated (${oCount} → ${nCount} ${nCount === 1 ? 'entry' : 'entries'})`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Application code + automation helpers
// ─────────────────────────────────────────────────────────────────────────────

async function mintApplicationCode(supabase: AdminClient): Promise<string | null> {
  // RPC defined in docs/migrations/add-recruitment-agent-fields.sql. If the
  // migration hasn't been applied yet, this gracefully returns null and the
  // candidate is created without a code — the recruiter can still backfill.
  const { data, error } = await supabase.rpc('mint_application_code');
  if (error) {
    console.warn('[ats] mint_application_code failed:', error.message);
    return null;
  }
  return typeof data === 'string' ? data : null;
}

async function tryUploadResume(args: {
  supabase:    AdminClient;
  candidateId: number;
  position:    string | null;
  fullName:    string;
  file:        File;
}): Promise<string | null> {
  try {
    const { signedUrl } = await uploadResumeToStorage({
      candidateId: args.candidateId,
      position:    args.position,
      fullName:    args.fullName,
      file:        args.file,
    });
    await args.supabase
      .from('candidates')
      .update({ resume_url: signedUrl, updated_at: new Date().toISOString() })
      .eq('id', args.candidateId);
    return signedUrl;
  } catch (err) {
    console.warn('[ats] resume upload failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function fireAutoCommunication(
  supabase: AdminClient,
  session:  SessionUser,
  candidateId: number,
  event: CommunicationEvent,
  context: string,
): Promise<CommunicationResult> {
  const result = await notifyCommunicationWebhook(event);
  if (result.ok) {
    await writeHistory(supabase, candidateId, session, [{
      field:    'email_sent',
      oldValue: null,
      newValue: result.template ?? context,
      summary:  result.template
        ? `Email sent (${result.template})`
        : `Email pipeline notified for ${context}`,
    }]);
  } else {
    await writeHistory(supabase, candidateId, session, [{
      field:    'email_failed',
      oldValue: context,
      newValue: null,
      summary:  `Email FAILED for ${context}: ${result.error}`,
    }]);
  }
  return result;
}

// Teams whose active members are emailed every new public application. Read
// live from `users`, so future HR/recruiting hires are included automatically.
// Mirrors the recruiting-access teams in lib/rbac.ts (core HR + recruiting).
const APPLICATION_NOTIFY_TEAMS = new Set([
  'human resources', 'hr', 'people', 'people operations', 'talent acquisition', 'recruiting',
]);

/**
 * Who n8n should email a new CV to: every active member of an HR/recruiting
 * team, plus the position's assigned recruiter, deduped and lowercased.
 */
async function getApplicationNotifyRecipients(
  supabase: AdminClient,
  recruiterEmail: string | null,
): Promise<string[]> {
  const emails = new Set<string>();
  if (recruiterEmail?.trim()) emails.add(recruiterEmail.trim().toLowerCase());
  try {
    const { data } = await supabase.from('users').select('email, team, is_active');
    for (const u of (data ?? []) as Array<{ email: string | null; team: string | null; is_active: number | boolean | null }>) {
      const active = u.is_active === 1 || u.is_active === true;
      const team = String(u.team ?? '').trim().toLowerCase();
      if (active && u.email && APPLICATION_NOTIFY_TEAMS.has(team)) {
        emails.add(u.email.trim().toLowerCase());
      }
    }
  } catch (err) {
    console.warn('[ats] getApplicationNotifyRecipients failed:', err instanceof Error ? err.message : err);
  }
  return [...emails];
}

// ─────────────────────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────────────────────

export async function createCandidate(formData: FormData) {
  const session = await requireSession();

  const fullNameRaw = String(formData.get('fullName')    ?? '').trim();
  const emailRaw    = String(formData.get('email')       ?? '').trim() || null;
  const phoneRaw    = String(formData.get('phone')       ?? '').trim() || null;
  const position    = String(formData.get('position')    ?? '').trim() || null;
  const source      = String(formData.get('source')      ?? '').trim() || null;
  const linkedinUrl = String(formData.get('linkedinUrl') ?? '').trim() || null;
  const notes       = String(formData.get('notes')       ?? '').trim() || null;

  if (!fullNameRaw) throw new Error('Full name is required');

  const fullName = toProperName(fullNameRaw);
  const phone    = phoneRaw ? formatPhoneNumber(phoneRaw) : null;
  const email    = emailRaw;

  const supabase = createAdminClient();
  const applicationCode = await mintApplicationCode(supabase);

  const { data: inserted, error } = await supabase
    .from('candidates')
    .insert({
      full_name:        fullName,
      email,
      phone,
      position,
      source,
      linkedin_url:     linkedinUrl,
      notes,
      status:           'pending_response',
      assigned_to:      session.id,
      created_by:       session.id,
      application_code: applicationCode,
    })
    .select('id')
    .single();
  if (error || !inserted) throw new Error(`Failed to create candidate: ${error?.message ?? 'unknown'}`);

  await writeHistory(supabase, inserted.id, session, [{
    field:    'created',
    oldValue: null,
    newValue: fullName,
    summary:  applicationCode
      ? `Added candidate '${fullName}' (${applicationCode})`
      : `Added candidate '${fullName}'`,
  }]);

  if (email) {
    await fireAutoCommunication(
      supabase, session, inserted.id,
      { kind: 'created', candidateId: inserted.id },
      'acknowledgment',
    );
  }

  revalidatePath('/recruiting/candidates');
}

// ─────────────────────────────────────────────────────────────────────────────
// Update (edit dialog)
// ─────────────────────────────────────────────────────────────────────────────

export type CandidateEditPatch = {
  full_name:  string;
  email:      string | null;
  phone:      string | null;
  position:   string | null;
  education:  ParsedEducation[];
  experience: ParsedExperience[];
};

export async function updateCandidate(id: number, patch: CandidateEditPatch) {
  const session = await requireSession();
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');

  const fullNameClean = toProperName(patch.full_name);
  if (!fullNameClean) throw new Error('Full name is required');

  const phoneClean = patch.phone ? formatPhoneNumber(patch.phone) : null;
  const emailClean = patch.email ? String(patch.email).trim() : null;
  const positionClean = patch.position ? String(patch.position).trim() : null;

  // Clean nested lists: trim strings, drop fully-empty rows.
  const education = (patch.education ?? [])
    .map(e => ({
      institution:     e.institution?.trim() || null,
      degree:          e.degree?.trim() || null,
      field:           e.field?.trim() || null,
      graduation_year: e.graduation_year?.trim() || null,
    }))
    .filter(e => e.institution || e.degree || e.field || e.graduation_year);

  const experience = (patch.experience ?? [])
    .map(x => ({
      company:     x.company?.trim() || null,
      title:       x.title?.trim() || null,
      start_date:  x.start_date?.trim() || null,
      end_date:    x.end_date?.trim() || null,
      description: x.description?.trim() || null,
    }))
    .filter(x => x.company || x.title || x.start_date || x.end_date || x.description);

  const supabase = createAdminClient();
  const { data: before, error: fetchError } = await supabase
    .from('candidates')
    .select('full_name, email, phone, position, education, experience')
    .eq('id', id)
    .maybeSingle();
  if (fetchError) throw new Error(`Failed to load candidate: ${fetchError.message}`);
  if (!before) throw new Error('Candidate not found');

  const { error: updateError } = await supabase
    .from('candidates')
    .update({
      full_name:  fullNameClean,
      email:      emailClean,
      phone:      phoneClean,
      position:   positionClean,
      education,
      experience,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (updateError) throw new Error(`Failed to update candidate: ${updateError.message}`);

  const entries: HistoryEntry[] = [];
  const nameEntry = diffSimple('name',     'Name',     before.full_name, fullNameClean);
  if (nameEntry)     entries.push(nameEntry);
  const emailEntry = diffSimple('email',   'Email',    before.email,    emailClean);
  if (emailEntry)    entries.push(emailEntry);
  const phoneEntry = diffSimple('phone',   'Phone',    before.phone,    phoneClean);
  if (phoneEntry)    entries.push(phoneEntry);
  const posEntry   = diffSimple('position','Position', before.position, positionClean);
  if (posEntry)      entries.push(posEntry);
  const eduEntry   = diffJsonList<ParsedEducation>('education',  'Education',       before.education  as ParsedEducation[]  | null, education);
  if (eduEntry)      entries.push(eduEntry);
  const expEntry   = diffJsonList<ParsedExperience>('experience','Work experience', before.experience as ParsedExperience[] | null, experience);
  if (expEntry)      entries.push(expEntry);

  await writeHistory(supabase, id, session, entries);

  revalidatePath('/recruiting/candidates');
  revalidatePath(`/recruiting/candidates/${id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Status / Rating / Delete
// ─────────────────────────────────────────────────────────────────────────────

export async function updateCandidateStatus(id: number, status: string) {
  const session = await requireSession();
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');
  if (!isStatus(status)) throw new Error('Invalid status');

  const supabase = createAdminClient();
  const { data: before } = await supabase
    .from('candidates')
    .select('status')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase
    .from('candidates')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`Failed to update candidate: ${error.message}`);

  if (before && before.status !== status) {
    await writeHistory(supabase, id, session, [{
      field:    'status',
      oldValue: before.status,
      newValue: status,
      summary:  `Status changed from '${before.status}' to '${status}'`,
    }]);

    if (AUTO_EMAIL_STATUSES.has(status)) {
      await fireAutoCommunication(
        supabase, session, id,
        { kind: 'status_changed', candidateId: id, status },
        `status:${status}`,
      );
    }

    // Bridge into Internal Onboarding when the candidate is hired. Idempotent
    // — re-flipping to 'hired' won't create duplicates. Failures are logged
    // to candidate_history but do NOT block the status update.
    if (status === 'hired') {
      const promo = await createOnboarderFromCandidate(id, {
        actorUserId: session.id,
        actorName:   session.name,
      });
      if (promo.ok) {
        await writeHistory(supabase, id, session, [{
          field:    'onboarder_created',
          oldValue: null,
          newValue: String(promo.onboarderId),
          summary:  promo.created
            ? `Created onboarder #${promo.onboarderId} from this hire`
            : `Onboarder #${promo.onboarderId} already exists for this hire`,
        }]);
      } else {
        await writeHistory(supabase, id, session, [{
          field:    'onboarder_create_failed',
          oldValue: null,
          newValue: null,
          summary:  `Auto-create onboarder FAILED — ${promo.error}`,
        }]);
      }
    }
  }

  revalidatePath('/recruiting/candidates');
  revalidatePath(`/recruiting/candidates/${id}`);
}

// Manual backfill for candidates hired before this bridge shipped, or where
// the auto-create failed. Wired to a button on the candidate detail page.
export async function backfillOnboarderFromCandidate(id: number) {
  const session = await requireSession();
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');

  const supabase = createAdminClient();
  const result = await createOnboarderFromCandidate(id, {
    actorUserId: session.id,
    actorName:   session.name,
  });
  if (!result.ok) throw new Error(result.error);

  await writeHistory(supabase, id, session, [{
    field:    'onboarder_created',
    oldValue: null,
    newValue: String(result.onboarderId),
    summary:  result.created
      ? `Backfilled onboarder #${result.onboarderId}`
      : `Onboarder #${result.onboarderId} already exists`,
  }]);

  revalidatePath(`/recruiting/candidates/${id}`);
  return { onboarderId: result.onboarderId, created: result.created };
}

// Flips the per-candidate "Publish to Talent Pool" toggle that powers the
// public showcase at romega-solutions.com/talent. Default is false; the
// recruiter is the only one who can publish, matching the existing
// "no profile sharing without approval" privacy promise.
export async function updateCandidatePublicTalent(id: number, isPublic: boolean) {
  const session = await requireSession();
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');

  const supabase = createAdminClient();
  const { data: before } = await supabase
    .from('candidates')
    .select('full_name, is_public_talent, consent_status')
    .eq('id', id)
    .maybeSingle();

  if (!before) throw new Error('Candidate not found');
  if (before.is_public_talent === isPublic) return; // no-op

  // GDPR gate: a candidate can only be published once consent is recorded.
  if (isPublic && before.consent_status !== 'agreed') {
    throw new Error('Cannot publish: candidate consent has not been recorded. Send the consent email and wait for the candidate to confirm, or mark consent agreed manually.');
  }

  const { error } = await supabase
    .from('candidates')
    .update({ is_public_talent: isPublic, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`Failed to update publish status: ${error.message}`);

  await writeHistory(supabase, id, session, [{
    field:    'is_public_talent',
    oldValue: String(before.is_public_talent),
    newValue: String(isPublic),
    summary:  isPublic
      ? `Published to public Talent Pool (romega-solutions.com/talent)`
      : `Removed from public Talent Pool`,
  }]);

  revalidatePath('/recruiting/candidates');
  revalidatePath(`/recruiting/candidates/${id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// GDPR Talent Pool consent
//
// A candidate must consent before being published to the public showcase.
// Flow: requestTalentConsent (HR) → candidate clicks the email link
// (/api/public/talents/confirm/<token>, sets method='link') → updateCandidate-
// PublicTalent can now publish. markTalentConsentAgreed is the HR manual-
// override (method='manual') for when written consent is held off-platform.
// revokeTalentConsent honors right-to-withdraw and unpublishes.
// ─────────────────────────────────────────────────────────────────────────────

function consentBaseUrl(): string {
  const raw = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || '';
  return raw.replace(/\/+$/, '');
}

// HR sends (or resends) the consent-request email. Generates a fresh token,
// moves status to 'requested', and fires the n8n communication webhook with a
// one-click confirm link. Email failure is non-fatal (status still advances;
// HR sees the failure in history and can resend).
export async function requestTalentConsent(id: number) {
  const session = await requireSession();
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');

  const supabase = createAdminClient();
  const { data: before } = await supabase
    .from('candidates')
    .select('full_name, email, consent_status')
    .eq('id', id)
    .maybeSingle();
  if (!before) throw new Error('Candidate not found');
  if (!before.email) throw new Error('Candidate has no email on file — add one before requesting consent.');

  const base = consentBaseUrl();
  if (!base) throw new Error('APP_BASE_URL is not configured — cannot build the consent link.');

  const token = randomBytes(32).toString('base64url');
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('candidates')
    .update({
      consent_status:       'requested',
      consent_token:        token,
      consent_requested_at: now,
      updated_at:           now,
    })
    .eq('id', id);
  if (error) throw new Error(`Failed to record consent request: ${error.message}`);

  await writeHistory(supabase, id, session, [{
    field:    'consent_status',
    oldValue: String(before.consent_status ?? 'none'),
    newValue: 'requested',
    summary:  'Talent Pool consent email requested',
  }]);

  const confirmUrl = `${base}/api/public/talents/confirm/${token}`;
  await fireAutoCommunication(
    supabase,
    session,
    id,
    {
      kind:           'talent_consent_request',
      candidateId:    id,
      candidateName:  before.full_name,
      candidateEmail: before.email,
      confirmUrl,
    },
    'talent_consent_request',
  );

  revalidatePath('/recruiting/candidates');
  revalidatePath(`/recruiting/candidates/${id}`);
}

// HR manual override — records consent when written proof is held off-platform.
export async function markTalentConsentAgreed(id: number) {
  const session = await requireSession();
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');

  const supabase = createAdminClient();
  const { data: before } = await supabase
    .from('candidates')
    .select('consent_status')
    .eq('id', id)
    .maybeSingle();
  if (!before) throw new Error('Candidate not found');

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('candidates')
    .update({
      consent_status:    'agreed',
      consent_agreed_at: now,
      consent_method:    'manual',
      consent_agreed_ip: null,
      updated_at:        now,
    })
    .eq('id', id);
  if (error) throw new Error(`Failed to mark consent agreed: ${error.message}`);

  await writeHistory(supabase, id, session, [{
    field:    'consent_status',
    oldValue: String(before.consent_status ?? 'none'),
    newValue: 'agreed',
    summary:  `Talent Pool consent marked agreed manually by ${session.name}`,
  }]);

  revalidatePath('/recruiting/candidates');
  revalidatePath(`/recruiting/candidates/${id}`);
}

// HR revoke / candidate withdrawal — unpublishes and clears the token.
export async function revokeTalentConsent(id: number) {
  const session = await requireSession();
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');

  const supabase = createAdminClient();
  const { data: before } = await supabase
    .from('candidates')
    .select('consent_status, is_public_talent')
    .eq('id', id)
    .maybeSingle();
  if (!before) throw new Error('Candidate not found');

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('candidates')
    .update({
      consent_status:   'revoked',
      is_public_talent: false,
      consent_token:    null,
      updated_at:       now,
    })
    .eq('id', id);
  if (error) throw new Error(`Failed to revoke consent: ${error.message}`);

  await writeHistory(supabase, id, session, [{
    field:    'consent_status',
    oldValue: String(before.consent_status ?? 'none'),
    newValue: 'revoked',
    summary:  before.is_public_talent
      ? 'Talent Pool consent revoked — candidate unpublished'
      : 'Talent Pool consent revoked',
  }]);

  revalidatePath('/recruiting/candidates');
  revalidatePath(`/recruiting/candidates/${id}`);
}

// Manual retry — re-fires the last attempted email template via the webhook.
// Used by the "Resend" button on the candidate detail page when the latest
// history entry is an `email_failed`.
export async function resendLastEmail(id: number, template: string) {
  const session = await requireSession();
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');
  if (!template) throw new Error('template is required');

  const supabase = createAdminClient();
  await fireAutoCommunication(
    supabase, session, id,
    { kind: 'resend', candidateId: id, template },
    `resend:${template}`,
  );

  revalidatePath(`/recruiting/candidates/${id}`);
}

export async function updateCandidateRating(id: number, rating: number | null) {
  const session = await requireSession();
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    throw new Error('Rating must be 1–5 or null');
  }

  const supabase = createAdminClient();
  const { data: before } = await supabase
    .from('candidates')
    .select('rating')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase
    .from('candidates')
    .update({ rating, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`Failed to update rating: ${error.message}`);

  const prev = before?.rating ?? null;
  if (prev !== rating) {
    const oldLabel = prev ? `${prev}/5` : 'none';
    const newLabel = rating ? `${rating}/5` : 'none';
    await writeHistory(supabase, id, session, [{
      field:    'rating',
      oldValue: prev === null ? null : String(prev),
      newValue: rating === null ? null : String(rating),
      summary:  `Rating changed from ${oldLabel} to ${newLabel}`,
    }]);
  }

  revalidatePath('/recruiting/candidates');
  revalidatePath(`/recruiting/candidates/${id}`);
}

export async function deleteCandidate(id: number) {
  await requireSession();
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');

  const supabase = createAdminClient();
  // candidate_history cascades on delete via FK.
  const { error } = await supabase.from('candidates').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete candidate: ${error.message}`);

  revalidatePath('/recruiting/candidates');
}

const DELETE_CANDIDATES_CONFIRMATION = 'DELETE CANDIDATES';

export async function deleteAllCandidates(confirmation: string) {
  await requireSession();
  if (confirmation !== DELETE_CANDIDATES_CONFIRMATION) {
    throw new Error(`Type ${DELETE_CANDIDATES_CONFIRMATION} to confirm`);
  }

  const supabase = createAdminClient();
  const { data, error: fetchError } = await supabase.from('candidates').select('id');
  if (fetchError) throw new Error(`Failed to inspect candidates: ${fetchError.message}`);

  const ids = (data ?? []).map(row => row.id).filter((id): id is number => Number.isInteger(id));
  if (ids.length > 0) {
    const { error } = await supabase.from('candidates').delete().in('id', ids);
    if (error) throw new Error(`Failed to delete candidates: ${error.message}`);
  }

  revalidatePath('/recruiting/candidates');
  return { ok: true as const, deleted: ids.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resume parsing
// ─────────────────────────────────────────────────────────────────────────────

type ParseSuccess = { ok: true;  parsed: ParsedResume; candidateId: number };
type ParseFailure = { ok: false; error: string; code: string };
export type ParseResumeResult = ParseSuccess | ParseFailure;

// The recruiter picks 'ai' (Groq) or 'regex' (key-free) in the upload popup.
// Defaults to 'regex' so any caller that doesn't send the field is unaffected.
function readParser(formData: FormData): 'regex' | 'ai' {
  return formData.get('parser') === 'ai' ? 'ai' : 'regex';
}

function applyParsedFieldsToRow(parsed: ParsedResume, existing: {
  full_name?: string | null;
  email?:     string | null;
  phone?:     string | null;
  linkedin_url?: string | null;
  position?:  string | null;
}) {
  // Merge strategy: overwrite empty existing fields with parsed values,
  // keep existing values when they're already set (user-edited wins).
  const pick = <T,>(curr: T | null | undefined, next: T | null) =>
    (curr && String(curr).trim() ? curr : next);

  const parsedName  = parsed.full_name  ? toProperName(parsed.full_name)  : null;
  const parsedPhone = parsed.phone      ? formatPhoneNumber(parsed.phone) : null;

  return {
    full_name:      pick(existing.full_name,    parsedName) ?? '',
    email:          pick(existing.email,        parsed.email),
    phone:          pick(existing.phone,        parsedPhone),
    linkedin_url:   pick(existing.linkedin_url, parsed.linkedin),
    location:       parsed.location,
    website:        parsed.website,
    summary:        parsed.summary,
    skills:         parsed.skills,
    experience:     parsed.experience,
    education:      parsed.education,
    certifications: parsed.certifications,
    languages:      parsed.languages,
    parsed_at:      new Date().toISOString(),
    updated_at:     new Date().toISOString(),
  };
}

export async function parseResumeForCandidate(
  candidateId: number,
  formData: FormData,
): Promise<ParseResumeResult> {
  const session = await requireSession();
  if (!Number.isInteger(candidateId) || candidateId <= 0) {
    return { ok: false, code: 'INVALID_ID', error: 'Invalid candidate id' };
  }

  const file = formData.get('resume');
  if (!(file instanceof File)) {
    return { ok: false, code: 'NO_FILE', error: 'No resume file provided' };
  }

  const result = await parseResumeWithN8n(file, candidateId, readParser(formData));
  if (!result.success) return { ok: false, code: result.code, error: result.error };

  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('candidates')
    .select('full_name, email, phone, linkedin_url, position')
    .eq('id', candidateId)
    .maybeSingle();

  if (!existing) {
    return { ok: false, code: 'NOT_FOUND', error: 'Candidate not found' };
  }

  const updates = applyParsedFieldsToRow(result.data, existing);
  const { error } = await supabase
    .from('candidates')
    .update(updates)
    .eq('id', candidateId);

  if (error) {
    return { ok: false, code: 'DB_ERROR', error: `Failed to save parsed data: ${error.message}` };
  }

  await writeHistory(supabase, candidateId, session, [{
    field:    'resume',
    oldValue: null,
    newValue: file.name,
    summary:  `Re-parsed resume '${file.name}'`,
  }]);

  // Persist the PDF in Supabase Storage and update resume_url. Failure is
  // logged but doesn't block — the parse already succeeded.
  await tryUploadResume({
    supabase,
    candidateId,
    position: existing.position ?? null,
    fullName: (updates.full_name as string) || existing.full_name || 'candidate',
    file,
  });

  revalidatePath('/recruiting/candidates');
  revalidatePath(`/recruiting/candidates/${candidateId}`);

  return { ok: true, parsed: result.data, candidateId };
}

type UploadResumeResult = { ok: true } | { ok: false; code: string; error: string };

/**
 * Attach a downloadable resume PDF to an existing candidate WITHOUT parsing.
 * Sets `resume_url`, which is what surfaces the "Download resume" button on the
 * candidate page. Unlike `parseResumeForCandidate`, this never touches n8n, so
 * it works for manually-added candidates and when the parser is unavailable.
 */
export async function uploadResumeFile(
  candidateId: number,
  formData: FormData,
): Promise<UploadResumeResult> {
  const session = await requireSession();
  if (!Number.isInteger(candidateId) || candidateId <= 0) {
    return { ok: false, code: 'INVALID_ID', error: 'Invalid candidate id' };
  }

  const file = formData.get('resume');
  if (!(file instanceof File)) {
    return { ok: false, code: 'NO_FILE', error: 'No resume file provided' };
  }
  if (file.size === 0) {
    return { ok: false, code: 'EMPTY_FILE', error: 'The file is empty' };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { ok: false, code: 'FILE_TOO_LARGE', error: 'Resume must be under 10 MB' };
  }
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46 && head[4] === 0x2d;
  if (!isPdf) {
    return { ok: false, code: 'INVALID_FILE_TYPE', error: 'Resume must be a valid PDF file' };
  }

  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from('candidates')
    .select('full_name, position')
    .eq('id', candidateId)
    .maybeSingle();
  if (!existing) {
    return { ok: false, code: 'NOT_FOUND', error: 'Candidate not found' };
  }

  const signedUrl = await tryUploadResume({
    supabase,
    candidateId,
    position: existing.position ?? null,
    fullName: existing.full_name || 'candidate',
    file,
  });
  if (!signedUrl) {
    return { ok: false, code: 'UPLOAD_FAILED', error: 'Could not store the resume — try again.' };
  }

  await writeHistory(supabase, candidateId, session, [{
    field:    'resume',
    oldValue: null,
    newValue: file.name,
    summary:  `Uploaded resume '${file.name}'`,
  }]);

  revalidatePath('/recruiting/candidates');
  revalidatePath(`/recruiting/candidates/${candidateId}`);
  return { ok: true };
}

export async function createCandidateFromResume(formData: FormData): Promise<ParseResumeResult> {
  const session = await requireSession();

  const file = formData.get('resume');
  if (!(file instanceof File)) {
    return { ok: false, code: 'NO_FILE', error: 'No resume file provided' };
  }

  const result = await parseResumeWithN8n(file, undefined, readParser(formData));
  if (!result.success) return { ok: false, code: result.code, error: result.error };

  const parsed = result.data;
  if (!parsed.full_name && !parsed.email) {
    return {
      ok: false,
      code: 'AI_EXTRACTION_EMPTY',
      error: 'Resume parsed but no name or email was found. Add candidate manually.',
    };
  }

  const parsedName  = parsed.full_name  ? toProperName(parsed.full_name)  : '(Unknown — parsed from resume)';
  const parsedPhone = parsed.phone      ? formatPhoneNumber(parsed.phone) : null;

  const supabase = createAdminClient();
  const applicationCode = await mintApplicationCode(supabase);

  const { data: inserted, error } = await supabase
    .from('candidates')
    .insert({
      full_name:        parsedName,
      email:            parsed.email,
      phone:            parsedPhone,
      linkedin_url:     parsed.linkedin,
      location:         parsed.location,
      website:          parsed.website,
      summary:          parsed.summary,
      skills:           parsed.skills,
      experience:       parsed.experience,
      education:        parsed.education,
      certifications:   parsed.certifications,
      languages:        parsed.languages,
      parsed_at:        new Date().toISOString(),
      source:           'manual',
      status:           'pending_response',
      assigned_to:      session.id,
      created_by:       session.id,
      application_code: applicationCode,
    })
    .select('id')
    .single();

  if (error || !inserted) {
    return { ok: false, code: 'DB_ERROR', error: `Failed to create candidate: ${error?.message ?? 'unknown'}` };
  }

  await writeHistory(supabase, inserted.id, session, [{
    field:    'created',
    oldValue: null,
    newValue: parsedName,
    summary:  applicationCode
      ? `Added candidate '${parsedName}' from resume '${file.name}' (${applicationCode})`
      : `Added candidate '${parsedName}' from resume '${file.name}'`,
  }]);

  // Persist the PDF in Supabase Storage (best-effort).
  await tryUploadResume({
    supabase,
    candidateId: inserted.id,
    position:    null,
    fullName:    parsedName,
    file,
  });

  if (parsed.email) {
    await fireAutoCommunication(
      supabase, session, inserted.id,
      { kind: 'created', candidateId: inserted.id },
      'acknowledgment',
    );
  }

  revalidatePath('/recruiting/candidates');

  return { ok: true, parsed, candidateId: inserted.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public application intake — used by /apply/[positionId]. Server-only:
// the public form server action calls this with anon caller (no session).
// Returns the new candidate id + application code.
// ─────────────────────────────────────────────────────────────────────────────

export async function createPublicApplication(args: {
  positionId: number;
  fullName:   string;
  email:      string;
  phone:      string;
  linkedinUrl: string | null;
  message:     string | null;
  resume:      File;
}): Promise<
  | { ok: true; candidateId: number; applicationCode: string | null }
  | { ok: false; error: string; code: string }
> {
  // Basic validation
  if (!args.fullName.trim()) return { ok: false, code: 'NAME_REQUIRED', error: 'Name is required' };
  if (!args.email.trim())    return { ok: false, code: 'EMAIL_REQUIRED', error: 'Email is required' };
  if (!args.phone.trim())    return { ok: false, code: 'PHONE_REQUIRED', error: 'Phone is required' };
  if (!(args.resume instanceof File) || args.resume.size === 0) {
    return { ok: false, code: 'NO_FILE', error: 'Resume PDF is required' };
  }
  if (args.resume.type !== 'application/pdf') {
    return { ok: false, code: 'INVALID_FILE_TYPE', error: 'Resume must be a PDF' };
  }
  if (args.resume.size > 10 * 1024 * 1024) {
    return { ok: false, code: 'FILE_TOO_LARGE', error: 'Resume must be under 10 MB' };
  }
  // Verify the file is actually a PDF (browser-provided MIME can be spoofed).
  // PDFs begin with the 5-byte signature "%PDF-".
  {
    const head = new Uint8Array(await args.resume.slice(0, 5).arrayBuffer());
    const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46 && head[4] === 0x2d;
    if (!isPdf) {
      return { ok: false, code: 'INVALID_FILE_TYPE', error: 'Resume must be a valid PDF file' };
    }
  }

  const supabase = createAdminClient();

  // Look up the position to attach the recruiter (assigned_to) and job title.
  const { data: position, error: posErr } = await supabase
    .from('positions')
    .select('id, job_title, created_by, is_open')
    .eq('id', args.positionId)
    .maybeSingle();
  if (posErr || !position) {
    return { ok: false, code: 'POSITION_NOT_FOUND', error: 'Position not found' };
  }
  if (!position.is_open) {
    return { ok: false, code: 'POSITION_CLOSED', error: 'This position is no longer accepting applications' };
  }

  // Dedup within 24h on (position, email).
  const emailNorm = args.email.trim().toLowerCase();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await supabase
    .from('candidates')
    .select('id, application_code')
    .eq('email', emailNorm)
    .eq('position', position.job_title)
    .gte('created_at', since)
    .maybeSingle();
  if (existing) {
    return { ok: true, candidateId: existing.id, applicationCode: existing.application_code ?? null };
  }

  const cleanedName = toProperName(args.fullName);
  const cleanedPhone = formatPhoneNumber(args.phone);

  // Parse resume via the existing n8n extractor. Failure is non-fatal —
  // we still create the candidate so the application isn't lost. The helper
  // already returns {success:false} on HTTP errors, but a network throw
  // (n8n down, DNS failure) would crash the request without this guard.
  let parsed: ParsedResume | null = null;
  try {
    const parseResult = await parseResumeWithN8n(args.resume);
    if (parseResult.success) parsed = parseResult.data;
  } catch (err) {
    console.error('[createPublicApplication] parseResumeWithN8n threw:', err);
  }

  const applicationCode = await mintApplicationCode(supabase);

  const { data: inserted, error } = await supabase
    .from('candidates')
    .insert({
      full_name:        cleanedName || (parsed?.full_name ? toProperName(parsed.full_name) : args.fullName),
      email:            emailNorm,
      phone:            cleanedPhone,
      position:         position.job_title,
      source:           'direct',
      linkedin_url:     args.linkedinUrl || parsed?.linkedin || null,
      notes:            args.message || null,
      status:           'pending_response',
      assigned_to:      position.created_by,
      created_by:       null,
      application_code: applicationCode,
      location:         parsed?.location ?? null,
      website:          parsed?.website ?? null,
      summary:          parsed?.summary ?? null,
      skills:           parsed?.skills ?? null,
      experience:       parsed?.experience ?? null,
      education:        parsed?.education ?? null,
      certifications:   parsed?.certifications ?? null,
      languages:        parsed?.languages ?? null,
      parsed_at:        parsed ? new Date().toISOString() : null,
    })
    .select('id')
    .single();

  if (error || !inserted) {
    return { ok: false, code: 'DB_ERROR', error: error?.message ?? 'Insert failed' };
  }

  // Synthetic "system" session for history rows on public applications.
  // Role is 'ic' (least privilege) — this session is only used for audit
  // attribution, never for authorization.
  const systemSession: SessionUser = {
    id: 0,
    email:    'system@romega',
    name:     'Public Application',
    username: 'system',
    role:     'ic',
    team:     null,
    jobTitle: null,
    isOnboarding: false,
    toolAccess: [],
  };

  try {
    await writeHistory(supabase, inserted.id, systemSession, [{
      field:    'created',
      oldValue: null,
      newValue: cleanedName,
      summary:  applicationCode
        ? `Public application received (${applicationCode}) for ${position.job_title}`
        : `Public application received for ${position.job_title}`,
    }]);
  } catch (err) {
    console.error('[createPublicApplication] writeHistory failed:', err);
  }

  let resumeUrl: string | null = null;
  try {
    resumeUrl = await tryUploadResume({
      supabase,
      candidateId: inserted.id,
      position:    position.job_title,
      fullName:    cleanedName,
      file:        args.resume,
    });
  } catch (err) {
    console.error('[createPublicApplication] tryUploadResume threw:', err);
  }

  try {
    await fireAutoCommunication(
      supabase, systemSession, inserted.id,
      { kind: 'created', candidateId: inserted.id },
      'acknowledgment',
    );
  } catch (err) {
    console.error('[createPublicApplication] fireAutoCommunication threw:', err);
  }

  // Ping the assigned recruiter so they know an application landed.
  // Non-fatal — the candidate row is the source of truth either way.
  let recruiterEmail: string | null = null;
  let recruiterName:  string | null = null;
  if (position.created_by) {
    const { data: recruiter } = await supabase
      .from('users')
      .select('email, name')
      .eq('id', position.created_by)
      .maybeSingle();
    recruiterEmail = recruiter?.email ?? null;
    recruiterName  = recruiter?.name  ?? null;
  }
  // Email recipients = the assigned recruiter + every active HR/recruiting
  // team member (Christine, Erich, and any future HR hire), deduped.
  const recipients = await getApplicationNotifyRecipients(supabase, recruiterEmail);

  const notifyResult = await notifyRecruiterOfApplication({
    candidateId:     inserted.id,
    candidateName:   cleanedName || args.fullName,
    candidateEmail:  emailNorm,
    candidatePhone:  cleanedPhone || null,
    applicationCode,
    positionId:      position.id,
    positionTitle:   position.job_title,
    recruiterUserId: position.created_by ?? null,
    recruiterEmail,
    recruiterName,
    recipients,
    resumeUrl,
  });
  if (!notifyResult.ok) {
    console.warn('[ats] recruiter notify failed:', notifyResult.error);
  }

  revalidatePath('/recruiting/candidates');

  return { ok: true, candidateId: inserted.id, applicationCode };
}
