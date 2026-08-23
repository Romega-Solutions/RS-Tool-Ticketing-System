import { Buffer } from 'node:buffer';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { route, parseBody, requireBearer, badRequest } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/admin';
import { uploadOnboarderDocument, type OnboarderDocumentKind } from '@/lib/storage';
import { recordOnboardingAvailability, resolveOnboardingFormTarget } from '@/lib/onboarding-sessions';

export const runtime = 'nodejs';

// Called by n8n after it has downloaded Jotform uploads. The form token is
// verified server-side; n8n never chooses the target onboarder ID.
const MAX_DOCUMENT_BYTES = 10_000_000;
const allowedMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const documentSchema = z.object({
  kind: z.enum(['sow', 'w8', 'gov_id', 'other']),
  label: z.string().trim().min(1).max(120),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().max(100),
  // A 10 MB file is roughly 13.4 MB after base64 encoding.
  contentBase64: z.string().min(1).max(13_500_000),
});

const optionalText = (max: number) => z.string().trim().max(max).optional()
  .transform((value) => value || null);

const hourlyRateSchema = z.union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => /^\d{1,8}(?:\.\d{1,2})?$/.test(value), 'Hourly rate must be a non-negative amount with up to two decimal places');

const submissionSchema = z.object({
  formToken: z.string().trim().min(32).max(128),
  availability: z.enum(['yes', 'no']),
  submittedAt: z.string().datetime().optional(),
  provider: z.literal('jotform'),
  submissionId: z.string().trim().min(1).max(255),
  documents: z.array(documentSchema).max(5).default([]),
  hourlyRate: hourlyRateSchema.optional(),
  wiseTag: optionalText(255),
  bankName: optionalText(255),
  bankAccountName: optionalText(255),
  bankAccountNumber: optionalText(255),
});

function decodeDocument(contentBase64: string, mimeType: string): Uint8Array {
  if (!allowedMimeTypes.has(mimeType)) {
    throw badRequest('Documents must be PDFs, JPEGs, PNGs, or WebP images');
  }
  const normalized = contentBase64.replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw badRequest('Document content must be base64 encoded');
  }
  const bytes = new Uint8Array(Buffer.from(normalized, 'base64'));
  if (bytes.length === 0 || bytes.length > MAX_DOCUMENT_BYTES) {
    throw badRequest('Each document must be between 1 byte and 10 MB');
  }
  return bytes;
}

export const POST = route(async (req: Request) => {
  requireBearer(req, process.env.N8N_ONBOARDING_SECRET);
  const body = await parseBody(req, submissionSchema);
  const submittedAt = body.submittedAt ? new Date(body.submittedAt) : new Date();

  // This has no side effects. Do not record form completion until every
  // document has made it to Storage and has a matching database row.
  const target = await resolveOnboardingFormTarget(body.formToken);
  const hasW8 = body.documents.some((document) => document.kind === 'w8');
  const hasPaymentFields = body.hourlyRate !== undefined
    || !!body.wiseTag || !!body.bankName || !!body.bankAccountName || !!body.bankAccountNumber;
  const hasBankDetails = !!body.bankName && !!body.bankAccountName && !!body.bankAccountNumber;
  const hasPartialBankDetails = !!body.bankName || !!body.bankAccountName || !!body.bankAccountNumber;
  if (target.onboarderType !== 'contractor' && (hasW8 || hasPaymentFields)) {
    throw badRequest('Contractor payment details and W-8 documents can only be submitted for contractors');
  }
  if (target.onboarderType === 'contractor' && !body.hourlyRate) {
    throw badRequest('Contractor submissions require an hourly rate');
  }
  if (target.onboarderType === 'contractor' && !body.wiseTag && !hasBankDetails) {
    throw badRequest(hasPartialBankDetails
      ? 'Bank name, account name, and account number must be supplied together'
      : 'Contractor submissions require a Wise tag or complete bank details');
  }
  if (target.onboarderType === 'contractor' && !hasW8) {
    throw badRequest('Contractor submissions require a W-8 document');
  }

  const supabase = createAdminClient();
  let documentsStored = 0;

  for (const document of body.documents) {
    // The label is deterministic for this provider submission. A retry can
    // safely skip a file already stored by an earlier attempt.
    const label = `Jotform ${body.submissionId} · ${document.label}`;
    const { data: existing, error: findError } = await supabase
      .from('onboarder_documents')
      .select('id')
      .eq('onboarder_id', target.onboarderId)
      .eq('label', label)
      .maybeSingle();
    if (findError) throw new Error(`Failed to check onboarding documents: ${findError.message}`);
    if (existing) continue;

    const bytes = decodeDocument(document.contentBase64, document.mimeType);
    const fileBytes = new Uint8Array(bytes.byteLength);
    fileBytes.set(bytes);
    const file = new File([fileBytes.buffer], document.fileName, { type: document.mimeType });
    const upload = await uploadOnboarderDocument({
      onboarderId: target.onboarderId,
      kind: document.kind as OnboarderDocumentKind,
      file,
      label,
    });
    const { error: insertError } = await supabase.from('onboarder_documents').insert({
      onboarder_id: target.onboarderId,
      kind: document.kind,
      label,
      storage_path: upload.path,
      mime_type: upload.mimeType,
      size_bytes: upload.sizeBytes,
      uploaded_by: null,
    });
    if (insertError) throw new Error(`Failed to save onboarding document: ${insertError.message}`);
    documentsStored += 1;
  }

  if (target.onboarderType === 'contractor') {
    const { error: paymentError } = await supabase.from('contractor_payment_details').upsert({
      onboarder_id: target.onboarderId,
      hourly_rate: body.hourlyRate!,
      wise_tag: body.wiseTag,
      bank_name: body.bankName,
      bank_account_name: body.bankAccountName,
      bank_account_number: body.bankAccountNumber,
      received_at: submittedAt.toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'onboarder_id' });
    if (paymentError) throw new Error(`Failed to save contractor payment details: ${paymentError.message}`);
  }

  // Completion is deliberately last: a failed upload leaves the welcome
  // action available, while a retry skips any document saved before failure.
  const result = await recordOnboardingAvailability(body.formToken, body.availability, submittedAt);

  if (documentsStored > 0) {
    await supabase.from('onboarder_history').insert({
      onboarder_id: result.onboarderId,
      user_name: 'Onboarding Bot',
      field: 'onboarding_form_documents_received',
      new_value: body.submissionId,
      summary: `Jotform onboarding submission received with ${documentsStored} document${documentsStored === 1 ? '' : 's'}.`,
    });
  }
  if (target.onboarderType === 'contractor') {
    await supabase.from('onboarder_history').insert({
      onboarder_id: result.onboarderId,
      user_name: 'Onboarding Bot',
      field: 'contractor_payment_details_received',
      new_value: null,
      summary: 'Contractor payment details and W-8 received.',
    });
  }

  return NextResponse.json({
    ok: true,
    onboarderId: result.onboarderId,
    availability: body.availability,
    documentsStored,
    contractorDetailsStored: target.onboarderType === 'contractor',
    reassigned: result.reassigned,
  });
});
