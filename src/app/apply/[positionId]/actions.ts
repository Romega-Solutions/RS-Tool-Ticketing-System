'use server';

import { createPublicApplication } from '@/app/(app)/recruiting/candidates/actions';

export type PublicApplicationResult =
  | { ok: true;  candidateId: number; applicationCode: string | null }
  | { ok: false; error: string; code: string };

export async function submitPublicApplication(
  positionId: number,
  formData: FormData,
): Promise<PublicApplicationResult> {
  const fullName    = String(formData.get('fullName')    ?? '');
  const email       = String(formData.get('email')       ?? '');
  const phone       = String(formData.get('phone')       ?? '');
  const linkedinUrl = String(formData.get('linkedinUrl') ?? '').trim() || null;
  const message     = String(formData.get('message')     ?? '').trim() || null;
  const resume      = formData.get('resume');

  if (!(resume instanceof File)) {
    return { ok: false, code: 'NO_FILE', error: 'Resume file is required' };
  }

  return createPublicApplication({
    positionId,
    fullName,
    email,
    phone,
    linkedinUrl,
    message,
    resume,
  });
}
