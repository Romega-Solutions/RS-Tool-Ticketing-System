'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession, type SessionUser } from '@/lib/session';
import { canAccessLeadTool } from '@/lib/rbac';
import { toProperName, formatPhoneNumber } from '@/lib/format';
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

export async function createOnboarder(formData: FormData): Promise<void> {
  const session = await requireSession();

  const fullNameRaw   = String(formData.get('fullName')         ?? '').trim();
  const personalEmail = String(formData.get('personalEmail')    ?? '').trim().toLowerCase();
  const phoneRaw      = String(formData.get('phone')            ?? '').trim() || null;
  const typeRaw       = String(formData.get('onboarderType')    ?? 'contractor');
  const roleTitle     = String(formData.get('roleTitle')        ?? '').trim() || null;
  const team          = String(formData.get('team')             ?? '').trim() || null;
  const directSup     = String(formData.get('directSupervisor') ?? '').trim() || null;
  const startDateRaw  = String(formData.get('startDate')        ?? '').trim() || null;

  if (!fullNameRaw)      throw new Error('Full name is required');
  if (!personalEmail)    throw new Error('Personal email is required');
  if (!isType(typeRaw))  throw new Error('Invalid onboarder type');

  const fullName = toProperName(fullNameRaw);
  const phone    = phoneRaw ? formatPhoneNumber(phoneRaw) : null;
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
    summary:  `Created onboarder '${fullName}' (${typeRaw}) at stage 'offer_signed'`,
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
    .select('status')
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

  // Permit only the 4 MVP templates from the manual resend path. Post-MVP
  // templates ship their own buttons.
  const allowed: OnboardingTemplate[] = [
    'bg-check-initiate', 'welcome', 'reference-request', 'employment-verification',
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
