'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';
import { createOnboarderUploadUrl, isIssuedOnboarderPath, verifyDirectUpload } from '@/lib/storage';
import {
  checkUploadFile,
  uploadErrorMessage,
  type DirectUploadTicket,
  type UploadActionResult,
} from '@/lib/direct-upload';

// Server actions powering the two in-app intake forms that replace the SOP's
// Google Forms. Onboarder-facing (the new hire themselves submits) — NOT
// gated by canAccessLeadTool; gated by users.is_onboarding instead.

type AdminClient = ReturnType<typeof createAdminClient>;

async function requireOnboardingUser() {
  const session = await getSession();
  if (!session)               throw new Error('Not authenticated');
  if (!session.isOnboarding)  throw new Error('Not flagged as onboarding');
  return session;
}

async function findOnboarderRow(supabase: AdminClient, userId: number) {
  const { data } = await supabase
    .from('onboarders')
    .select('id, onboarder_type, status, onboarding_form_submitted_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as
    | { id: number; onboarder_type: string; status: string; onboarding_form_submitted_at: string | null }
    | null;
}

async function logHistory(
  supabase:    AdminClient,
  onboarderId: number,
  userId:      number,
  userName:    string,
  field:       string,
  summary:     string,
) {
  await supabase.from('onboarder_history').insert({
    onboarder_id: onboarderId,
    user_id:      userId,
    user_name:    userName,
    field,
    old_value:    null,
    new_value:    null,
    summary,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// W-8 upload — the browser uploads the file straight to storage with a
// one-time signed URL from this step; submitContractorIntake then records it.
// ─────────────────────────────────────────────────────────────────────────────

export async function prepareIntakeW8Upload(input: {
  legalName: string; name: string; size: number; type: string;
}): Promise<UploadActionResult<DirectUploadTicket>> {
  try {
    const session  = await requireOnboardingUser();
    const supabase = createAdminClient();
    const onb      = await findOnboarderRow(supabase, session.id);
    if (!onb)                             throw new Error('No onboarder record found for your account. Tell HR.');
    if (onb.onboarding_form_submitted_at) throw new Error('Already submitted — contact HR if you need to re-upload.');
    const legalName = String(input?.legalName ?? '').trim();
    if (!legalName) throw new Error('Legal name is required');
    const check = checkUploadFile({ name: input.name, size: input.size, type: input.type }, 'onboarder_document');
    if (!check.ok) throw new Error(check.error);
    const ticket = await createOnboarderUploadUrl({
      onboarderId: onb.id, kind: 'w8', fileName: input.name, label: `${legalName} W-8`, extension: check.extension,
    });
    return { ok: true, data: ticket };
  } catch (err) {
    return { ok: false, error: uploadErrorMessage(err, 'Could not start the W-8 upload') };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Contractor intake — SOP §5/7a (full form, requires W-8 PDF for non-US)
// ─────────────────────────────────────────────────────────────────────────────

export async function submitContractorIntake(formData: FormData): Promise<UploadActionResult> {
  try {
    await saveContractorIntake(formData);
  } catch (err) {
    return { ok: false, error: uploadErrorMessage(err, 'Could not submit the form') };
  }
  revalidatePath('/my-tasks');
  redirect('/my-tasks?intake=submitted');
}

async function saveContractorIntake(formData: FormData): Promise<void> {
  const session  = await requireOnboardingUser();
  const supabase = createAdminClient();
  const onb      = await findOnboarderRow(supabase, session.id);
  if (!onb)                                throw new Error('No onboarder record found for your account. Tell HR.');
  if (onb.onboarding_form_submitted_at)    throw new Error('Already submitted — contact HR if you need to re-upload.');

  const legalName       = String(formData.get('legalName')       ?? '').trim();
  const preferredName   = String(formData.get('preferredName')   ?? '').trim() || null;
  const phone           = String(formData.get('phone')           ?? '').trim() || null;
  const mailingAddress  = String(formData.get('mailingAddress')  ?? '').trim() || null;
  const dateOfBirth     = String(formData.get('dateOfBirth')     ?? '').trim() || null;
  const country         = String(formData.get('country')         ?? '').trim() || null;
  const taxId           = String(formData.get('taxId')           ?? '').trim() || null;
  const wiseHolderName  = String(formData.get('wiseHolderName')  ?? '').trim() || null;
  const wiseEmail       = String(formData.get('wiseEmail')       ?? '').trim() || null;
  const wiseCurrency    = String(formData.get('wiseCurrency')    ?? '').trim() || null;
  const emergencyName   = String(formData.get('emergencyName')   ?? '').trim() || null;
  const emergencyRel    = String(formData.get('emergencyRel')    ?? '').trim() || null;
  const emergencyPhone  = String(formData.get('emergencyPhone')  ?? '').trim() || null;
  const consent         = String(formData.get('consent')         ?? '') === 'on';
  // The W-8 itself was uploaded straight to storage by the browser; only its
  // path, name, size and type come through here.
  const w8Path          = String(formData.get('w8Path')          ?? '').trim();
  const w8Name          = String(formData.get('w8Name')          ?? '').trim();
  const w8Size          = Number(formData.get('w8Size')          ?? 0);
  const w8Type          = String(formData.get('w8Type')          ?? '').trim();

  if (!legalName)        throw new Error('Legal name is required');
  if (!consent)          throw new Error('You must accept the Independent Contractor Agreement');
  if (!w8Path)           throw new Error('W-8 form (PDF) is required');
  if (!isIssuedOnboarderPath(w8Path, onb.id, 'w8')) throw new Error('This W-8 upload does not belong to your onboarding record');

  // 1. Check the uploaded W-8 (deleted if it is over the size cap).
  const upload = await verifyDirectUpload('onboarder_document', {
    path: w8Path, fileName: w8Name, size: w8Size, type: w8Type,
  });

  // 2. Insert document row.
  const { error: docError } = await supabase.from('onboarder_documents').insert({
    onboarder_id: onb.id,
    kind:         'w8',
    label:        `W-8 — ${legalName}`,
    storage_path: upload.path,
    mime_type:    upload.mimeType,
    size_bytes:   upload.sizeBytes,
    uploaded_by:  session.id,
  });
  if (docError) throw new Error(`Failed to record the W-8: ${docError.message}`);

  // 3. Stamp the onboarder row with form / banking / W-8 timestamps + capture
  //    the submitted details in `notes` (until we add dedicated columns).
  const now = new Date().toISOString();
  const intakeSnapshot = [
    `--- Onboarding form (contractor) — submitted ${now} ---`,
    `Legal name: ${legalName}`,
    preferredName  && `Preferred name: ${preferredName}`,
    phone          && `Phone: ${phone}`,
    mailingAddress && `Address: ${mailingAddress}`,
    dateOfBirth    && `DOB: ${dateOfBirth}`,
    country        && `Country of residence: ${country}`,
    taxId          && `Tax ID: ${taxId}`,
    wiseHolderName && `Wise — holder: ${wiseHolderName}`,
    wiseEmail      && `Wise — email: ${wiseEmail}`,
    wiseCurrency   && `Wise — currency: ${wiseCurrency}`,
    emergencyName  && `Emergency contact: ${emergencyName} (${emergencyRel ?? '—'}) ${emergencyPhone ?? ''}`,
  ].filter(Boolean).join('\n');

  await supabase
    .from('onboarders')
    .update({
      onboarding_form_submitted_at: now,
      wise_details_submitted_at:    wiseHolderName ? now : null,
      w8_uploaded_at:               now,
      phone:                        phone ?? undefined,
      notes:                        intakeSnapshot,
      updated_at:                   now,
    })
    .eq('id', onb.id);

  await logHistory(
    supabase, onb.id, session.id, session.name,
    'onboarding_form_submitted',
    `Contractor intake form submitted (W-8 uploaded, ${wiseHolderName ? 'Wise details captured' : 'no Wise details'})`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Intern intake — SOP §5/7b (no W-8; adds school / program / professor)
// ─────────────────────────────────────────────────────────────────────────────

export async function submitInternIntake(formData: FormData): Promise<void> {
  const session  = await requireOnboardingUser();
  const supabase = createAdminClient();
  const onb      = await findOnboarderRow(supabase, session.id);
  if (!onb)                                throw new Error('No onboarder record found for your account. Tell HR.');
  if (onb.onboarding_form_submitted_at)    throw new Error('Already submitted — contact HR if you need to make changes.');

  const legalName        = String(formData.get('legalName')        ?? '').trim();
  const preferredName    = String(formData.get('preferredName')    ?? '').trim() || null;
  const phone            = String(formData.get('phone')            ?? '').trim() || null;
  const mailingAddress   = String(formData.get('mailingAddress')   ?? '').trim() || null;
  const dateOfBirth      = String(formData.get('dateOfBirth')      ?? '').trim() || null;
  const school           = String(formData.get('school')           ?? '').trim() || null;
  const program          = String(formData.get('program')          ?? '').trim() || null;
  const internStart      = String(formData.get('internStart')      ?? '').trim() || null;
  const internEnd        = String(formData.get('internEnd')        ?? '').trim() || null;
  const professor        = String(formData.get('professor')        ?? '').trim() || null;
  const emergencyName    = String(formData.get('emergencyName')    ?? '').trim() || null;
  const emergencyRel     = String(formData.get('emergencyRel')     ?? '').trim() || null;
  const emergencyPhone   = String(formData.get('emergencyPhone')   ?? '').trim() || null;

  if (!legalName) throw new Error('Legal name is required');

  const now = new Date().toISOString();
  const intakeSnapshot = [
    `--- Onboarding form (intern) — submitted ${now} ---`,
    `Legal name: ${legalName}`,
    preferredName  && `Preferred name: ${preferredName}`,
    phone          && `Phone: ${phone}`,
    mailingAddress && `Address: ${mailingAddress}`,
    dateOfBirth    && `DOB: ${dateOfBirth}`,
    school         && `School: ${school}`,
    program        && `Program: ${program}`,
    internStart    && `Internship start: ${internStart}`,
    internEnd      && `Internship end: ${internEnd}`,
    professor      && `Supervising professor: ${professor}`,
    emergencyName  && `Emergency contact: ${emergencyName} (${emergencyRel ?? '—'}) ${emergencyPhone ?? ''}`,
  ].filter(Boolean).join('\n');

  await supabase
    .from('onboarders')
    .update({
      onboarding_form_submitted_at: now,
      phone:                        phone ?? undefined,
      notes:                        intakeSnapshot,
      updated_at:                   now,
    })
    .eq('id', onb.id);

  await logHistory(
    supabase, onb.id, session.id, session.name,
    'onboarding_form_submitted',
    'Intern intake form submitted',
  );

  revalidatePath('/my-tasks');
  redirect('/my-tasks?intake=submitted');
}
