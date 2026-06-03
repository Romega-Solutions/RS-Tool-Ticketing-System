'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession, type SessionUser } from '@/lib/session';
import { canAccessLeadTool } from '@/lib/rbac';
import { toProperName, formatPhoneNumber } from '@/lib/format';
import { APP_DEPARTMENTS } from '@/lib/orgchart';
import {
  uploadOnboarderDocument,
  type OnboarderDocumentKind,
} from '@/lib/storage';
import {
  notifyOnboardingWebhook,
  type OnboardingEvent,
  type OnboardingResult,
  type OnboardingTemplate,
} from '@/lib/n8n';
import {
  ALLOWED_STATUSES,
  ALLOWED_TYPES,
  DEFAULT_ONBOARDING_LEAD,
  type OnboarderStatus,
  type OnboarderType,
} from './constants';

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

type AdminClient = ReturnType<typeof createAdminClient>;

async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error('Not authenticated');
  if (!canAccessLeadTool('onboarding', session.role, session.team)) {
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
  const result = await notifyOnboardingWebhook(event);
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
  const directSup     = String(formData.get('directSupervisor') ?? '').trim() || null;
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
  const { data: inserted, error } = await supabase
    .from('onboarders')
    .insert({
      full_name:         fullName,
      personal_email:    personalEmail,
      phone,
      onboarder_type:    typeRaw,
      role_title:        roleTitle,
      team,
      direct_supervisor: directSup,
      onboarding_lead:   DEFAULT_ONBOARDING_LEAD,
      start_date:        startDate,
      status:            'offer_signed',
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
    summary:  `Created onboarder '${fullName}' (${typeRaw}) at stage 'offer_signed' — Lead: ${DEFAULT_ONBOARDING_LEAD}`,
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
    if (status === 'background_check') {
      // SOP §3: the background-check email goes out when the onboarder enters
      // background_check. Reference + employment-verification asks stay manual
      // (they need per-referee / per-company child rows).
      await fireOnboardingTemplate(
        supabase, session, id,
        { onboarderId: id, template: 'bg-check-initiate', event: 'status_changed', context: baseContext },
        'auto: BG-check initiate on stage entry',
      );
    } else if (status === 'pre_onboarding') {
      // SOP §5: the official welcome email (contractor/intern variant, forked in
      // n8n on onboarder_type) goes out when the onboarder enters pre_onboarding.
      await fireOnboardingTemplate(
        supabase, session, id,
        {
          onboarderId: id,
          template:    'welcome',
          event:       'status_changed',
          context:     {
            ...baseContext,
            onboarder_type: before.onboarder_type,
            chief_of_staff: before.chief_of_staff ?? '',
          },
        },
        'auto: welcome email on stage entry',
      );
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
    .select('id, full_name, personal_email, onboarder_type, role_title, onboarding_lead, chief_of_staff, direct_supervisor')
    .eq('id', onboarderId)
    .maybeSingle();
  if (!o) throw new Error('Onboarder not found');

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
        onboarding_lead:   o.onboarding_lead    ?? session.name,
        chief_of_staff:    o.chief_of_staff     ?? '',
        direct_supervisor: o.direct_supervisor  ?? '',
      },
    },
    `welcome (${o.onboarder_type})`,
  );

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
  'jibble_invited_at',
  'wise_setup_at',
  'group_chats_joined_at',
  'orientation_done_at',
] as const;
export type Day1Key = typeof DAY1_KEYS[number];

const DAY1_LABEL: Record<Day1Key, string> = {
  teams_installed_at:    'Teams installed',
  gmail_created_at:      'Romega Gmail created',
  signature_set_at:      'Email signature set',
  jibble_invited_at:     'Jibble invited',
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

  // Read current row so we can detect "all 7 done" and auto-advance.
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

  // Auto-advance to thirty_day if all 7 checklist items are now set AND the
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
        summary:  `Auto-advanced to thirty_day — all 7 Day-1 checklist items complete`,
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
  await requireSession();

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
    onboarding_lead:   DEFAULT_ONBOARDING_LEAD,
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
