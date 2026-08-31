'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession, type SessionUser } from '@/lib/session';
import { hasToolAccess } from '@/lib/rbac';
import { toProperName, formatPhoneNumber } from '@/lib/format';
import { APP_DEPARTMENTS } from '@/lib/orgchart';
import {
  uploadOnboarderDocument,
  type OnboarderDocumentKind,
} from '@/lib/storage';
import {
  notifyOnboardingWebhook,
  notifyFormReminder,
  type OnboardingEvent,
  type OnboardingResult,
  type OnboardingTemplate,
} from '@/lib/n8n';
import {
  ALLOWED_STATUSES,
  ALLOWED_TYPES,
  type OnboarderStatus,
  type OnboarderType,
} from './constants';
import { resolveOnboardingLead } from '@/lib/onboarding-lead';
import {
  getOrAssignOnboarderToOpenSession,
  formatSessionForEmail,
  issueOnboardingFormToken,
  onboardingFormUrl,
} from '@/lib/onboarding-sessions';

// ─────────────────────────────────────────────────────────────────────────────
// Internal type guards
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_DOC_KINDS: OnboarderDocumentKind[] = [
  'sow','w8','nda','contract','gov_id','nbi',
  'reference_response','employment_verification','other',
];

function isStatus(v: string): v is OnboarderStatus {
  return (ALLOWED_STATUSES as readonly string[]).includes(v);
}
function isType(v: string): v is OnboarderType {
  return (ALLOWED_TYPES as readonly string[]).includes(v);
}
function isDocKind(v: string): v is OnboarderDocumentKind {
  return (ALLOWED_DOC_KINDS as readonly string[]).includes(v);
}

function normalizeOptionalEmail(value: string | null | undefined, label: string): string | null {
  const email = String(value ?? '').trim().toLowerCase();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`${label} must be a valid email address`);
  return email;
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  if (!hasToolAccess('onboarding', session.role, session.toolAccess)) {
    throw new Error('Not authorized');
  }
  return session;
}

// ─────────────────────────────────────────────────────────────────────────────
// History
// ─────────────────────────────────────────────────────────────────────────────

type HistoryEntry = {
  field:    string;
  oldValue: string | null;
  newValue: string | null;
  summary:  string;
};

async function writeHistory(
  supabase:    AdminClient,
  onboarderId: number,
  session:     SessionUser,
  entries:     HistoryEntry[],
) {
  if (entries.length === 0) return;
  const rows = entries.map(e => ({
    onboarder_id: onboarderId,
    user_id:      session.id,
    user_name:    session.name,
    field:        e.field,
    old_value:    e.oldValue,
    new_value:    e.newValue,
    summary:      e.summary,
  }));
  const { error } = await supabase.from('onboarder_history').insert(rows);
  if (error) {
    console.warn('[onboarders] failed to write onboarder_history:', error.message);
  }
}

async function fireOnboardingTemplate(
  supabase:    AdminClient,
  session:     SessionUser,
  onboarderId: number,
  event:       OnboardingEvent,
  context:     string,
): Promise<OnboardingResult> {
  const { data: onboardingRecord, error: onboardingRecordError } = await supabase
    .from('onboarders')
    .select('onboarding_lead_id')
    .eq('id', onboarderId)
    .maybeSingle();
  if (onboardingRecordError) throw new Error(onboardingRecordError.message);

  let onboardingLeadEmail: string | undefined;
  if (onboardingRecord?.onboarding_lead_id) {
    const { data: onboardingLead, error: onboardingLeadError } = await supabase
      .from('users')
      .select('email')
      .eq('id', onboardingRecord.onboarding_lead_id)
      .maybeSingle();
    if (onboardingLeadError) throw new Error(onboardingLeadError.message);
    onboardingLeadEmail = onboardingLead?.email?.trim() || undefined;
  }

  const eventWithRequester: OnboardingEvent = {
    ...event,
    context: {
      ...event.context,
      onboarding_lead_email: onboardingLeadEmail,
    },
  };
  const result = await notifyOnboardingWebhook(eventWithRequester);
  if (result.ok) {
    await supabase
      .from('onboarders')
      .update({
        last_email_template: result.template ?? event.template,
        last_email_sent_at:  new Date().toISOString(),
        updated_at:          new Date().toISOString(),
      })
      .eq('id', onboarderId);
    await writeHistory(supabase, onboarderId, session, [{
      field:    'email_sent',
      oldValue: null,
      newValue: result.template ?? event.template,
      summary:  `Email sent (${result.template ?? event.template}) — ${context}`,
    }]);
  } else {
    await writeHistory(supabase, onboarderId, session, [{
      field:    'email_failed',
      oldValue: event.template,
      newValue: null,
      summary:  `Email FAILED (${event.template}) — ${context}: ${result.error}`,
    }]);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Create / delete onboarder
// ─────────────────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createOnboarder(formData: FormData): Promise<void> {
  const session = await requireSession();

  const fullNameRaw   = String(formData.get('fullName')         ?? '').trim();
  const personalEmail = String(formData.get('personalEmail')    ?? '').trim().toLowerCase();
  const phoneRaw      = String(formData.get('phone')            ?? '').trim() || null;
  const typeRaw       = String(formData.get('onboarderType')    ?? 'contractor');
  const roleTitle     = String(formData.get('roleTitle')        ?? '').trim() || null;
  const teamRaw       = String(formData.get('team')             ?? '').trim();
  const directSupervisorIdRaw = String(formData.get('directSupervisorId') ?? '').trim();
  const onboardingLeadIdRaw = String(formData.get('onboardingLeadId') ?? '').trim();
  const startDateRaw  = String(formData.get('startDate')        ?? '').trim() || null;

  // ── Guardrails ─────────────────────────────────────────────────────────
  if (!fullNameRaw || fullNameRaw.length < 2) {
    throw new Error('Full name is required (min 2 characters)');
  }
  if (!personalEmail) {
    throw new Error('Personal email is required');
  }
  if (!EMAIL_RE.test(personalEmail)) {
    throw new Error('Enter a valid personal email address');
  }
  if (!isType(typeRaw)) {
    throw new Error('Pick a valid type (contractor or intern)');
  }
  if (!teamRaw) {
    throw new Error('Department is required');
  }
  const onboardingLeadId = Number(onboardingLeadIdRaw);
  if (!Number.isInteger(onboardingLeadId) || onboardingLeadId <= 0) {
    throw new Error('Select an onboarding lead');
  }
  const directSupervisorId = directSupervisorIdRaw ? Number(directSupervisorIdRaw) : null;
  if (directSupervisorIdRaw && (!Number.isInteger(directSupervisorId) || (directSupervisorId ?? 0) <= 0)) {
    throw new Error('Select a valid direct supervisor');
  }
  if (!(APP_DEPARTMENTS as readonly string[]).includes(teamRaw)) {
    throw new Error(`Department '${teamRaw}' is not on the org chart. Pick from the dropdown.`);
  }
  if (startDateRaw && !/^\d{4}-\d{2}-\d{2}$/.test(startDateRaw)) {
    throw new Error('Start date must be a valid YYYY-MM-DD');
  }

  const fullName  = toProperName(fullNameRaw);
  const phone     = phoneRaw ? formatPhoneNumber(phoneRaw) : null;
  const team      = teamRaw;
  const startDate = startDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(startDateRaw) ? startDateRaw : null;

  const supabase = createAdminClient();
  const onboardingLead = await resolveOnboardingLead(onboardingLeadId);
  const directSupervisor = await resolveOnboardingLead(directSupervisorId);
  if (!onboardingLead) throw new Error('Select an onboarding lead');
  const { data: inserted, error } = await supabase
    .from('onboarders')
    .insert({
      full_name:         fullName,
      personal_email:    personalEmail,
      phone,
      onboarder_type:    typeRaw,
      role_title:        roleTitle,
      team,
      direct_supervisor: directSupervisor?.name ?? null,
      direct_supervisor_id: directSupervisor?.id ?? null,
      onboarding_lead:   onboardingLead.name,
      onboarding_lead_id: onboardingLead.id,
      start_date:        startDate,
      status:            'pre_onboarding',
      created_by:        session.id,
    })
    .select('id')
    .single();
  if (error || !inserted) {
    throw new Error(`Failed to create onboarder: ${error?.message ?? 'unknown'}`);
  }

  await writeHistory(supabase, inserted.id, session, [{
    field:    'created',
    oldValue: null,
    newValue: fullName,
    summary:  `Created onboarder '${fullName}' (${typeRaw}) at stage 'pre_onboarding' — Lead: ${onboardingLead.name}`,
  }]);

  revalidatePath('/onboarders');
  redirect(`/onboarders/${inserted.id}`);
}

export async function deleteOnboarder(id: number): Promise<void> {
  await requireSession();
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');

  const supabase = createAdminClient();
  const { error } = await supabase.from('onboarders').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete onboarder: ${error.message}`);

  revalidatePath('/onboarders');
}

export async function assignOnboardingLead(
  onboarderId: number,
  leadUserId: number | null,
): Promise<void> {
  const session = await requireSession();
  if (!Number.isInteger(onboarderId) || onboarderId <= 0) throw new Error('Invalid onboarder id');

  const supabase = createAdminClient();
  const { data: before, error: beforeError } = await supabase
    .from('onboarders')
    .select('onboarding_lead, onboarding_lead_id')
    .eq('id', onboarderId)
    .maybeSingle();
  if (beforeError) throw new Error(`Failed to load onboarding record: ${beforeError.message}`);
  if (!before) throw new Error('Onboarder not found');

  const lead = await resolveOnboardingLead(leadUserId);
  const { error } = await supabase
    .from('onboarders')
    .update({
      onboarding_lead_id: lead?.id ?? null,
      onboarding_lead: lead?.name ?? null,
      onboarding_lead_teams_email: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', onboarderId);
  if (error) throw new Error(`Failed to assign onboarding lead: ${error.message}`);

  const oldName = before.onboarding_lead ?? null;
  const newName = lead?.name ?? null;
  if (oldName !== newName) {
    await writeHistory(supabase, onboarderId, session, [{
      field: 'onboarding_lead',
      oldValue: oldName,
      newValue: newName,
      summary: newName
        ? `Onboarding Lead assigned to '${newName}'`
        : 'Onboarding Lead assignment cleared',
    }]);
  }

  revalidatePath('/onboarders');
  revalidatePath(`/onboarders/${onboarderId}`);
}

export async function assignDirectSupervisor(
  onboarderId: number,
  supervisorUserId: number | null,
): Promise<void> {
  const session = await requireSession();
  if (!Number.isInteger(onboarderId) || onboarderId <= 0) throw new Error('Invalid onboarder id');

  const supabase = createAdminClient();
  const { data: before, error: beforeError } = await supabase
    .from('onboarders')
    .select('direct_supervisor, direct_supervisor_id')
    .eq('id', onboarderId)
    .maybeSingle();
  if (beforeError) throw new Error(`Failed to load onboarding record: ${beforeError.message}`);
  if (!before) throw new Error('Onboarder not found');

  const supervisor = await resolveOnboardingLead(supervisorUserId);
  const { error } = await supabase
    .from('onboarders')
    .update({
      direct_supervisor_id: supervisor?.id ?? null,
      direct_supervisor: supervisor?.name ?? null,
      direct_supervisor_teams_email: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', onboarderId);
  if (error) throw new Error(`Failed to assign direct supervisor: ${error.message}`);

  const oldName = before.direct_supervisor ?? null;
  const newName = supervisor?.name ?? null;
  if (oldName !== newName) {
    await writeHistory(supabase, onboarderId, session, [{
      field: 'direct_supervisor',
      oldValue: oldName,
      newValue: newName,
      summary: newName
        ? `Direct Supervisor assigned to '${newName}'`
        : 'Direct Supervisor assignment cleared',
    }]);
  }

  revalidatePath('/onboarders');
  revalidatePath(`/onboarders/${onboarderId}`);
}

export async function updateOnboardingTeamsEmails(
  onboarderId: number,
  values: { onboardingLeadTeamsEmail: string; directSupervisorTeamsEmail: string },
): Promise<void> {
  const session = await requireSession();
  if (!Number.isInteger(onboarderId) || onboarderId <= 0) throw new Error('Invalid onboarder id');

  const onboardingLeadTeamsEmail = normalizeOptionalEmail(values.onboardingLeadTeamsEmail, 'Onboarding Lead Teams email');
  const directSupervisorTeamsEmail = normalizeOptionalEmail(values.directSupervisorTeamsEmail, 'Direct Supervisor Teams email');
  const supabase = createAdminClient();
  const { data: onboarder, error: findError } = await supabase
    .from('onboarders')
    .select('onboarding_lead_id, direct_supervisor_id')
    .eq('id', onboarderId)
    .maybeSingle();
  if (findError) throw new Error(`Failed to load onboarding record: ${findError.message}`);
  if (!onboarder) throw new Error('Onboarder not found');
  if (onboardingLeadTeamsEmail && !onboarder.onboarding_lead_id) {
    throw new Error('Assign an Onboarding Lead before setting their Teams email');
  }
  if (directSupervisorTeamsEmail && !onboarder.direct_supervisor_id) {
    throw new Error('Assign a Direct Supervisor before setting their Teams email');
  }

  const { error } = await supabase.from('onboarders').update({
    onboarding_lead_teams_email: onboardingLeadTeamsEmail,
    direct_supervisor_teams_email: directSupervisorTeamsEmail,
    updated_at: new Date().toISOString(),
  }).eq('id', onboarderId);
  if (error) throw new Error(`Failed to save Teams email overrides: ${error.message}`);

  await writeHistory(supabase, onboarderId, session, [{
    field: 'teams_contact_emails',
    oldValue: null,
    newValue: null,
    summary: 'Updated Microsoft Teams contact email overrides',
  }]);
  revalidatePath(`/onboarders/${onboarderId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Status transitions
// ─────────────────────────────────────────────────────────────────────────────

export async function updateOnboarderStatus(id: number, status: string): Promise<void> {
  const session = await requireSession();
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');
  if (!isStatus(status)) throw new Error('Invalid status');

  const supabase = createAdminClient();
  const { data: before } = await supabase
    .from('onboarders')
    .select('status, full_name, personal_email, role_title, team, direct_supervisor, onboarding_lead, onboarder_type, chief_of_staff')
    .eq('id', id)
    .maybeSingle();

  const { error } = await supabase
    .from('onboarders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`Failed to update status: ${error.message}`);

  if (before && before.status !== status) {
    await writeHistory(supabase, id, session, [{
      field:    'status',
      oldValue: before.status,
      newValue: status,
      summary:  `Stage changed from '${before.status}' to '${status}'`,
    }]);

    // Auto-fire probation milestone emails on transition. Failures are
    // recorded as 'email_failed' rows but never block the status change.
    const baseContext = {
      full_name:         before.full_name,
      first_name:        firstName(before.full_name),
      personal_email:    before.personal_email,
      role_title:        before.role_title ?? '',
      team:              before.team ?? '',
      direct_supervisor: before.direct_supervisor ?? '',
      onboarding_lead:   before.onboarding_lead ?? session.name,
    };
    if (status === 'pre_onboarding') {
      // SOP §5: the official welcome email (contractor/intern variant, forked in
      // n8n on onboarder_type) goes out when the onboarder enters pre_onboarding.
      // The Onboarding Lead explicitly sends the welcome email once the
      // handoff details have been reviewed and assigned.
    } else if (status === 'thirty_day') {
      await fireOnboardingTemplate(
        supabase, session, id,
        { onboarderId: id, template: '30-day-checkin', event: 'status_changed', context: baseContext },
        'auto: 30-day check-in on stage entry',
      );
    } else if (status === 'regularized' || status === 'failed_probation') {
      await fireOnboardingTemplate(
        supabase, session, id,
        {
          onboarderId: id,
          template:    '90-day-review',
          event:       'status_changed',
          context:     { ...baseContext, outcome: status },
        },
        `auto: 90-day review (${status})`,
      );
    }
  }

  revalidatePath('/onboarders');
  revalidatePath(`/onboarders/${id}`);
}

export async function markSowSent(id: number): Promise<void> {
  const session = await requireSession();
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');

  const now = new Date().toISOString();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('onboarders')
    .update({ sow_sent_at: now, updated_at: now })
    .eq('id', id);
  if (error) throw new Error(`Failed to mark SOW sent: ${error.message}`);

  await writeHistory(supabase, id, session, [{
    field:    'sow_sent_at',
    oldValue: null,
    newValue: now,
    summary:  'Marked SOW as sent to new hire',
  }]);

  revalidatePath(`/onboarders/${id}`);
}

export async function markSowSigned(id: number): Promise<void> {
  const session = await requireSession();
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid id');

  const now = new Date().toISOString();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('onboarders')
    .update({ sow_signed_at: now, updated_at: now })
    .eq('id', id);
  if (error) throw new Error(`Failed to mark SOW signed: ${error.message}`);

  await writeHistory(supabase, id, session, [{
    field:    'sow_signed_at',
    oldValue: null,
    newValue: now,
    summary:  'Marked SOW as signed by new hire',
  }]);

  revalidatePath(`/onboarders/${id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// References (character)
// ─────────────────────────────────────────────────────────────────────────────

export async function addReference(onboarderId: number, formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!Number.isInteger(onboarderId) || onboarderId <= 0) throw new Error('Invalid id');

  const refereeName    = String(formData.get('refereeName')    ?? '').trim();
  const refereeRole    = String(formData.get('refereeRole')    ?? '').trim() || null;
  const refereeCompany = String(formData.get('refereeCompany') ?? '').trim() || null;
  const relationship   = String(formData.get('relationship')   ?? '').trim() || null;
  const datesWorked    = String(formData.get('datesWorked')    ?? '').trim() || null;
  const email          = String(formData.get('email')          ?? '').trim().toLowerCase();
  const mobile         = String(formData.get('mobile')         ?? '').trim() || null;
  const bestTime       = String(formData.get('bestTime')       ?? '').trim() || null;

  if (!refereeName) throw new Error('Referee name is required');
  if (!email)       throw new Error('Referee email is required');

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('onboarder_references')
    .insert({
      onboarder_id:    onboarderId,
      referee_name:    refereeName,
      referee_role:    refereeRole,
      referee_company: refereeCompany,
      relationship,
      dates_worked:    datesWorked,
      email,
      mobile,
      best_time:       bestTime,
    });
  if (error) throw new Error(`Failed to add reference: ${error.message}`);

  await writeHistory(supabase, onboarderId, session, [{
    field:    'reference_added',
    oldValue: null,
    newValue: refereeName,
    summary:  `Added character reference '${refereeName}' (${email})`,
  }]);

  revalidatePath(`/onboarders/${onboarderId}`);
}

export async function sendReferenceRequest(referenceId: number): Promise<void> {
  const session = await requireSession();
  if (!Number.isInteger(referenceId) || referenceId <= 0) throw new Error('Invalid id');

  const supabase = createAdminClient();
  const { data: ref } = await supabase
    .from('onboarder_references')
    .select('id, onboarder_id, referee_name, email')
    .eq('id', referenceId)
    .maybeSingle();
  if (!ref) throw new Error('Reference not found');

  const { data: onb } = await supabase
    .from('onboarders')
    .select('full_name, role_title, onboarding_lead')
    .eq('id', ref.onboarder_id)
    .maybeSingle();

  const now = new Date().toISOString();
  await supabase
    .from('onboarder_references')
    .update({ request_sent_at: now })
    .eq('id', referenceId);

  await fireOnboardingTemplate(
    supabase, session, ref.onboarder_id,
    {
      onboarderId: ref.onboarder_id,
      template:    'reference-request',
      event:       'manual_send',
      context: {
        referee_id:      ref.id,
        referee_name:    ref.referee_name,
        referee_email:   ref.email,
        full_name:       onb?.full_name      ?? '',
        role_title:      onb?.role_title     ?? '',
        onboarding_lead: onb?.onboarding_lead ?? session.name,
      },
    },
    `reference '${ref.referee_name}'`,
  );

  revalidatePath(`/onboarders/${ref.onboarder_id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Employment verifications
// ─────────────────────────────────────────────────────────────────────────────

export async function addEmploymentVerification(
  onboarderId: number,
  formData:    FormData,
): Promise<void> {
  const session = await requireSession();
  if (!Number.isInteger(onboarderId) || onboarderId <= 0) throw new Error('Invalid id');

  const company       = String(formData.get('company')       ?? '').trim();
  const hrContactName = String(formData.get('hrContactName') ?? '').trim() || null;
  const hrEmail       = String(formData.get('hrEmail')       ?? '').trim().toLowerCase();
  const hrPhone       = String(formData.get('hrPhone')       ?? '').trim() || null;
  const bestTime      = String(formData.get('bestTime')      ?? '').trim() || null;

  if (!company) throw new Error('Company is required');
  if (!hrEmail) throw new Error('HR email is required');

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('onboarder_employment_verifications')
    .insert({
      onboarder_id:    onboarderId,
      company,
      hr_contact_name: hrContactName,
      hr_email:        hrEmail,
      hr_phone:        hrPhone,
      best_time:       bestTime,
    });
  if (error) throw new Error(`Failed to add employment verification: ${error.message}`);

  await writeHistory(supabase, onboarderId, session, [{
    field:    'verification_added',
    oldValue: null,
    newValue: company,
    summary:  `Added employment verification for '${company}' (${hrEmail})`,
  }]);

  revalidatePath(`/onboarders/${onboarderId}`);
}

export async function sendEmploymentVerification(verificationId: number): Promise<void> {
  const session = await requireSession();
  if (!Number.isInteger(verificationId) || verificationId <= 0) throw new Error('Invalid id');

  const supabase = createAdminClient();
  const { data: v } = await supabase
    .from('onboarder_employment_verifications')
    .select('id, onboarder_id, company, hr_contact_name, hr_email')
    .eq('id', verificationId)
    .maybeSingle();
  if (!v) throw new Error('Verification not found');

  const { data: onb } = await supabase
    .from('onboarders')
    .select('full_name, role_title, onboarding_lead')
    .eq('id', v.onboarder_id)
    .maybeSingle();

  const now = new Date().toISOString();
  await supabase
    .from('onboarder_employment_verifications')
    .update({ request_sent_at: now })
    .eq('id', verificationId);

  await fireOnboardingTemplate(
    supabase, session, v.onboarder_id,
    {
      onboarderId: v.onboarder_id,
      template:    'employment-verification',
      event:       'manual_send',
      context: {
        verification_id: v.id,
        company:         v.company,
        hr_contact_name: v.hr_contact_name,
        hr_email:        v.hr_email,
        full_name:       onb?.full_name      ?? '',
        role_title:      onb?.role_title     ?? '',
        onboarding_lead: onb?.onboarding_lead ?? session.name,
      },
    },
    `employment verification for '${v.company}'`,
  );

  revalidatePath(`/onboarders/${v.onboarder_id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Email sends (BG-check ask, welcome)
// ─────────────────────────────────────────────────────────────────────────────

export async function sendBgCheckEmail(onboarderId: number): Promise<void> {
  const session = await requireSession();
  if (!Number.isInteger(onboarderId) || onboarderId <= 0) throw new Error('Invalid id');

  const supabase = createAdminClient();
  const { data: o } = await supabase
    .from('onboarders')
    .select('id, full_name, personal_email, role_title, onboarding_lead')
    .eq('id', onboarderId)
    .maybeSingle();
  if (!o) throw new Error('Onboarder not found');

  await fireOnboardingTemplate(
    supabase, session, onboarderId,
    {
      onboarderId,
      template: 'bg-check-initiate',
      event:    'manual_send',
      context: {
        full_name:       o.full_name,
        first_name:      firstName(o.full_name),
        personal_email:  o.personal_email,
        role_title:      o.role_title ?? '',
        onboarding_lead: o.onboarding_lead ?? session.name,
      },
    },
    'BG-check initiate (SOP §3)',
  );

  revalidatePath(`/onboarders/${onboarderId}`);
}

export async function sendWelcomeEmail(onboarderId: number): Promise<void> {
  const session = await requireSession();
  if (!Number.isInteger(onboarderId) || onboarderId <= 0) throw new Error('Invalid id');

  const supabase = createAdminClient();
  const { data: o } = await supabase
    .from('onboarders')
    .select('id, full_name, personal_email, onboarder_type, role_title, onboarding_lead, onboarding_lead_id, onboarding_lead_teams_email, direct_supervisor, direct_supervisor_id, direct_supervisor_teams_email, onboarding_form_submitted_at')
    .eq('id', onboarderId)
    .maybeSingle();
  if (!o) throw new Error('Onboarder not found');
  if (o.onboarding_form_submitted_at) {
    throw new Error('The onboarding form has already been submitted. Do not send another welcome link.');
  }
  if (!o.onboarding_lead_id || !o.onboarding_lead) {
    throw new Error('Assign an Onboarding Lead before sending the welcome email');
  }
  if (!o.direct_supervisor_id || !o.direct_supervisor) {
    throw new Error('Assign a Direct Supervisor before sending the welcome email');
  }

  const [leadResult, supervisorResult] = await Promise.all([
    supabase.from('users').select('name, email').eq('id', o.onboarding_lead_id).maybeSingle(),
    supabase.from('users').select('name, email').eq('id', o.direct_supervisor_id).maybeSingle(),
  ]);
  if (leadResult.error || !leadResult.data) {
    throw new Error('Could not load the assigned Onboarding Lead');
  }
  if (supervisorResult.error || !supervisorResult.data) {
    throw new Error('Could not load the assigned Direct Supervisor');
  }
  const onboardingLeadName = leadResult.data.name?.trim() || o.onboarding_lead;
  const directSupervisorName = supervisorResult.data.name?.trim() || o.direct_supervisor;
  const onboardingLeadTeamsEmail = o.onboarding_lead_teams_email?.trim() || leadResult.data.email?.trim();
  const directSupervisorTeamsEmail = o.direct_supervisor_teams_email?.trim() || supervisorResult.data.email?.trim();
  if (!onboardingLeadTeamsEmail) {
    throw new Error('Set an Onboarding Lead Teams email before sending the welcome email');
  }
  if (!directSupervisorTeamsEmail) {
    throw new Error('Set a Direct Supervisor Teams email before sending the welcome email');
  }

  const onboardingSession = await getOrAssignOnboarderToOpenSession(onboarderId);
  const formToken = await issueOnboardingFormToken(onboarderId);

  await fireOnboardingTemplate(
    supabase, session, onboarderId,
    {
      onboarderId,
      template: 'welcome',
      event:    'manual_send',
      context: {
        onboarder_type:    o.onboarder_type,
        full_name:         o.full_name,
        first_name:        firstName(o.full_name),
        personal_email:    o.personal_email,
        role_title:        o.role_title         ?? '',
        onboarding_lead:   onboardingLeadName,
        // Keep the portal address in onboarding_lead_email for the n8n CC
        // policy. Teams contact addresses are separate because they can differ.
        onboarding_lead_teams_email: onboardingLeadTeamsEmail,
        direct_supervisor: directSupervisorName,
        direct_supervisor_teams_email: directSupervisorTeamsEmail,
        onboarding_session_date: formatSessionForEmail(onboardingSession),
        onboarding_session_starts_at: onboardingSession.starts_at,
        onboarding_form_url: onboardingFormUrl(formToken, o.onboarder_type, onboardingSession),
      },
    },
    `welcome (${o.onboarder_type})`,
  );

  revalidatePath(`/onboarders/${onboarderId}`);
}

/** Sends a linkless nudge. The original, still-valid Jotform link is preserved. */
export async function sendOnboardingFormReminder(onboarderId: number): Promise<void> {
  const session = await requireSession();
  if (!Number.isInteger(onboarderId) || onboarderId <= 0) throw new Error('Invalid id');

  const supabase = createAdminClient();
  const { data: onboarder, error } = await supabase
    .from('onboarders')
    .select('id, full_name, personal_email, onboarding_form_submitted_at, last_email_template, last_email_sent_at, onboarding_form_reminder_sent_at, onboarding_lead_id')
    .eq('id', onboarderId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load onboarding record: ${error.message}`);
  if (!onboarder) throw new Error('Onboarder not found');
  if (onboarder.onboarding_form_submitted_at) throw new Error('The onboarding form has already been submitted');
  if (onboarder.last_email_template !== 'welcome' || !onboarder.last_email_sent_at) {
    throw new Error('Send the welcome email before sending a form reminder');
  }
  if (!onboarder.personal_email?.trim()) {
    throw new Error('This onboarder does not have a personal email address');
  }

  let onboardingLeadEmail: string | undefined;
  if (onboarder.onboarding_lead_id) {
    const { data: onboardingLead, error: onboardingLeadError } = await supabase
      .from('users')
      .select('email')
      .eq('id', onboarder.onboarding_lead_id)
      .maybeSingle();
    if (onboardingLeadError) throw new Error(onboardingLeadError.message);
    onboardingLeadEmail = onboardingLead?.email?.trim() || undefined;
  }

  const result = await notifyFormReminder({
    source: 'onboarding',
    reminderType: 'onboarding_form',
    onboarderId,
    recipientEmail: onboarder.personal_email.trim(),
    recipientName: firstName(onboarder.full_name),
    subjectName: onboarder.full_name,
    onboardingLeadEmail,
  });
  if (!result.ok) throw new Error(result.error);

  const now = new Date().toISOString();
  const { error: markError } = await supabase.from('onboarders')
    .update({ onboarding_form_reminder_sent_at: now, updated_at: now })
    .eq('id', onboarderId);
  if (markError) throw new Error(`Reminder sent but could not save its timestamp: ${markError.message}`);
  await writeHistory(supabase, onboarderId, session, [{
    field: 'onboarding_form_reminder_sent', oldValue: null, newValue: now,
    summary: 'Manual reminder sent for the existing onboarding form link',
  }]);
  revalidatePath('/onboarders');
  revalidatePath(`/onboarders/${onboarderId}`);
}

export async function resendOnboardingEmail(onboarderId: number, template: string): Promise<void> {
  const session = await requireSession();
  if (!Number.isInteger(onboarderId) || onboarderId <= 0) throw new Error('Invalid id');
  if (!template) throw new Error('template is required');

  // Permit the 4 MVP templates plus the two post-MVP emails (gmail signature
  // nudge, group-chat announce) so failed sends can be retried from the UI.
  const allowed: OnboardingTemplate[] = [
    'bg-check-initiate', 'welcome', 'reference-request', 'employment-verification',
    'gmail-signature-nudge', 'group-chat-announce',
  ];
  if (!allowed.includes(template as OnboardingTemplate)) {
    throw new Error('That template cannot be resent from this surface');
  }

  const supabase = createAdminClient();
  await fireOnboardingTemplate(
    supabase, session, onboarderId,
    {
      onboarderId,
      template: template as OnboardingTemplate,
      event:    'manual_send',
    },
    `manual resend of ${template}`,
  );

  revalidatePath(`/onboarders/${onboarderId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Day-1 checklist toggles + Notes edit
// ─────────────────────────────────────────────────────────────────────────────

const DAY1_KEYS = [
  'teams_installed_at',
  'gmail_created_at',
  'signature_set_at',
  'wise_setup_at',
  'group_chats_joined_at',
  'orientation_done_at',
] as const;
export type Day1Key = typeof DAY1_KEYS[number];

const DAY1_LABEL: Record<Day1Key, string> = {
  teams_installed_at:    'Teams installed',
  gmail_created_at:      'Romega Gmail created',
  signature_set_at:      'Email signature set',
  wise_setup_at:         'Wise account set up',
  group_chats_joined_at: 'Group chats joined',
  orientation_done_at:   'Orientation done',
};

function isDay1Key(v: string): v is Day1Key {
  return (DAY1_KEYS as readonly string[]).includes(v);
}

export async function toggleChecklistItem(
  onboarderId: number,
  key:         string,
  on:          boolean,
): Promise<void> {
  const session = await requireSession();
  if (!Number.isInteger(onboarderId) || onboarderId <= 0) throw new Error('Invalid id');
  if (!isDay1Key(key)) throw new Error('Invalid checklist key');

  const now = new Date().toISOString();
  const supabase = createAdminClient();

  // Read current row so we can detect "all 6 done" and auto-advance.
  const { data: before } = await supabase
    .from('onboarders')
    .select(`id, status, ${DAY1_KEYS.join(', ')}`)
    .eq('id', onboarderId)
    .maybeSingle() as unknown as { data: ({ id: number; status: string } & Record<Day1Key, string | null>) | null };
  if (!before) throw new Error('Onboarder not found');

  const { error } = await supabase
    .from('onboarders')
    .update({ [key]: on ? now : null, updated_at: now })
    .eq('id', onboarderId);
  if (error) throw new Error(`Failed to toggle ${key}: ${error.message}`);

  await writeHistory(supabase, onboarderId, session, [{
    field:    key,
    oldValue: before[key] ?? null,
    newValue: on ? now : null,
    summary:  on
      ? `Day-1 checklist: ${DAY1_LABEL[key]} ✓`
      : `Day-1 checklist: ${DAY1_LABEL[key]} cleared`,
  }]);

  // Auto-advance to thirty_day if all 6 checklist items are now set AND the
  // onboarder is currently in day_one. Skip from any other status (don't
  // accidentally promote someone in pre_onboarding or ninety_day).
  if (on && before.status === 'day_one') {
    const next = { ...before, [key]: now } as Record<Day1Key, string | null>;
    const allDone = DAY1_KEYS.every(k => next[k]);
    if (allDone) {
      await supabase
        .from('onboarders')
        .update({ status: 'thirty_day', updated_at: now })
        .eq('id', onboarderId);
      await writeHistory(supabase, onboarderId, session, [{
        field:    'status',
        oldValue: 'day_one',
        newValue: 'thirty_day',
        summary:  'Auto-advanced to thirty_day - all 6 Day-1 checklist items complete',
      }]);
    }
  }

  revalidatePath(`/onboarders/${onboarderId}`);
}

export async function updateOnboarderNotes(
  onboarderId: number,
  notes:       string,
): Promise<void> {
  const session = await requireSession();
  if (!Number.isInteger(onboarderId) || onboarderId <= 0) throw new Error('Invalid id');

  const clean = notes.length > 8000 ? notes.slice(0, 8000) : notes;

  const supabase = createAdminClient();
  const { data: before } = await supabase
    .from('onboarders')
    .select('notes')
    .eq('id', onboarderId)
    .maybeSingle();

  const { error } = await supabase
    .from('onboarders')
    .update({ notes: clean, updated_at: new Date().toISOString() })
    .eq('id', onboarderId);
  if (error) throw new Error(`Failed to save notes: ${error.message}`);

  if ((before?.notes ?? '') !== clean) {
    await writeHistory(supabase, onboarderId, session, [{
      field:    'notes',
      oldValue: before?.notes ?? null,
      newValue: clean || null,
      summary:  clean ? 'Updated notes' : 'Cleared notes',
    }]);
  }

  revalidatePath(`/onboarders/${onboarderId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Gmail signature nudge + group-chat announcement (post-MVP emails)
// ─────────────────────────────────────────────────────────────────────────────

export async function sendGmailSignatureNudge(onboarderId: number): Promise<void> {
  const session = await requireSession();
  if (!Number.isInteger(onboarderId) || onboarderId <= 0) throw new Error('Invalid id');

  const supabase = createAdminClient();
  const { data: o } = await supabase
    .from('onboarders')
    .select('id, full_name, personal_email, onboarder_type, role_title, onboarding_lead')
    .eq('id', onboarderId)
    .maybeSingle();
  if (!o) throw new Error('Onboarder not found');

  await fireOnboardingTemplate(
    supabase, session, onboarderId,
    {
      onboarderId,
      template: 'gmail-signature-nudge',
      event:    'manual_send',
      context: {
        onboarder_type:  o.onboarder_type,
        full_name:       o.full_name,
        first_name:      firstName(o.full_name),
        personal_email:  o.personal_email,
        role_title:      o.role_title ?? '',
        onboarding_lead: o.onboarding_lead ?? session.name,
      },
    },
    `gmail signature nudge (${o.onboarder_type})`,
  );

  revalidatePath(`/onboarders/${onboarderId}`);
}

export async function sendGroupChatAnnouncement(onboarderId: number): Promise<void> {
  const session = await requireSession();
  if (!Number.isInteger(onboarderId) || onboarderId <= 0) throw new Error('Invalid id');

  const supabase = createAdminClient();
  const { data: o } = await supabase
    .from('onboarders')
    .select('id, full_name, onboarder_type, role_title, team, direct_supervisor, start_date, onboarding_lead')
    .eq('id', onboarderId)
    .maybeSingle();
  if (!o) throw new Error('Onboarder not found');

  await fireOnboardingTemplate(
    supabase, session, onboarderId,
    {
      onboarderId,
      template: 'group-chat-announce',
      event:    'manual_send',
      context: {
        full_name:            o.full_name,
        first_name:           firstName(o.full_name),
        onboarder_type:       o.onboarder_type,
        onboarder_type_label: o.onboarder_type === 'intern' ? 'intern' : 'contractor',
        role_title:           o.role_title ?? '',
        team:                 o.team ?? '',
        direct_supervisor:    o.direct_supervisor ?? '',
        start_date:           o.start_date ?? '',
        onboarding_lead:      o.onboarding_lead ?? session.name,
      },
    },
    'group-chat announcement (SOP §7)',
  );

  revalidatePath(`/onboarders/${onboarderId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Document upload
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadDocument(
  onboarderId: number,
  formData:    FormData,
): Promise<void> {
  const session = await requireSession();
  if (!Number.isInteger(onboarderId) || onboarderId <= 0) throw new Error('Invalid id');

  const kindRaw = String(formData.get('kind') ?? '').trim();
  const label   = String(formData.get('label') ?? '').trim() || null;
  const file    = formData.get('file');

  if (!isDocKind(kindRaw)) throw new Error('Invalid document kind');
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('Choose a file to upload');
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new Error('File must be under 25 MB');
  }

  const upload = await uploadOnboarderDocument({
    onboarderId,
    kind:  kindRaw,
    file,
    label,
  });

  const supabase = createAdminClient();
  const { error } = await supabase.from('onboarder_documents').insert({
    onboarder_id:  onboarderId,
    kind:          kindRaw,
    label,
    storage_path:  upload.path,
    mime_type:     upload.mimeType,
    size_bytes:    upload.sizeBytes,
    uploaded_by:   session.id,
  });
  if (error) throw new Error(`Failed to record document: ${error.message}`);

  // Convenience: if a W-8 was uploaded, stamp w8_uploaded_at on the onboarder.
  if (kindRaw === 'w8') {
    await supabase
      .from('onboarders')
      .update({ w8_uploaded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', onboarderId);
  }

  await writeHistory(supabase, onboarderId, session, [{
    field:    'document_uploaded',
    oldValue: null,
    newValue: kindRaw,
    summary:  `Uploaded ${kindRaw}${label ? ` — ${label}` : ''} (${file.name})`,
  }]);

  revalidatePath(`/onboarders/${onboarderId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal
// ─────────────────────────────────────────────────────────────────────────────

function firstName(full: string): string {
  return (full ?? '').trim().split(/\s+/)[0] ?? '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Test trigger — used by /onboarders/setup to verify each MVP workflow lives.
// Synthesizes a payload, fires the webhook, and returns the result so the UI
// can show success or failure. Does NOT write to onboarders / onboarder_history
// (the onboarderId in the payload is 0 to make this obvious in n8n logs).
// ─────────────────────────────────────────────────────────────────────────────

const TEST_ELIGIBLE_TEMPLATES: OnboardingTemplate[] = [
  'bg-check-initiate', 'reference-request', 'employment-verification', 'welcome',
  'gmail-signature-nudge', 'group-chat-announce',
];

export async function triggerTestWorkflow(args: {
  template:      string;
  recipientEmail: string;
  onboarderType?: 'contractor' | 'intern';
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const session = await requireSession();

  const template = args.template as OnboardingTemplate;
  if (!TEST_ELIGIBLE_TEMPLATES.includes(template)) {
    return { ok: false, error: `Template '${args.template}' is not test-triggerable from the setup page` };
  }
  const recipient = args.recipientEmail?.trim().toLowerCase();
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return { ok: false, error: 'Provide a valid recipient email' };
  }

  const type = args.onboarderType === 'intern' ? 'intern' : 'contractor';
  const fullName = 'Test Onboarder';
  const sharedContext = {
    full_name:         fullName,
    first_name:        'Test',
    personal_email:    recipient,
    role_title:        'Frontend Engineer (test)',
    team:              'Engineering',
    direct_supervisor: 'Mark Tan',
    chief_of_staff:    'Chief of Staff',
    onboarding_lead:   session.name,
  };

  let context: Record<string, unknown> = sharedContext;
  switch (template) {
    case 'reference-request':
      context = {
        ...sharedContext,
        referee_id:    0,
        referee_name:  'Test Referee',
        referee_email: recipient,
      };
      break;
    case 'employment-verification':
      context = {
        ...sharedContext,
        verification_id: 0,
        company:         'Previous Co (test)',
        hr_contact_name: 'HR Department',
        hr_email:        recipient,
      };
      break;
    case 'welcome':
      context = { ...sharedContext, onboarder_type: type };
      break;
    case 'gmail-signature-nudge':
      context = { ...sharedContext, onboarder_type: type };
      break;
    case 'group-chat-announce':
      context = {
        ...sharedContext,
        onboarder_type:       type,
        onboarder_type_label: type === 'intern' ? 'intern' : 'contractor',
        start_date:           new Date().toISOString().slice(0, 10),
      };
      break;
    // bg-check-initiate falls through to the sharedContext default.
  }

  const result = await notifyOnboardingWebhook({
    onboarderId: 0,
    template,
    event:       'manual_send',
    context,
  });

  if (result.ok) {
    return { ok: true, message: `Webhook responded OK. Check ${recipient} for the email.` };
  }
  return { ok: false, error: result.error };
}
