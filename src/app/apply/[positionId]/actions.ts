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
  const honeypot    = String(formData.get('company_website') ?? '').trim();
  const loadedAt    = Number(formData.get('loadedAt') ?? 0);
  const resume      = formData.get('resume');

  // Anti-spam — naive bots fill the honeypot and submit faster than humans.
  // Fail open with a generic-looking success so bots don't learn the trigger.
  if (honeypot.length > 0) {
    console.warn('[ats] public application blocked: honeypot filled', { positionId });
    return { ok: true, candidateId: 0, applicationCode: null };
  }
  if (loadedAt > 0 && Date.now() - loadedAt < 2_000) {
    console.warn('[ats] public application blocked: submitted too fast', { positionId, elapsedMs: Date.now() - loadedAt });
    return { ok: true, candidateId: 0, applicationCode: null };
  }

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
