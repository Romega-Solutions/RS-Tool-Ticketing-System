import { createHash, randomBytes } from 'node:crypto';

/**
 * A form request is a capability link: possession of its unguessable token is
 * enough to submit one specific pre-employment form. Keep form definitions
 * here so the sending, URL-building, and intake paths cannot drift apart.
 */
export const PRE_EMPLOYMENT_FORMS = {
  background_check: {
    urlEnvKey: 'JOTFORM_BG_CHECK_FORM_URL',
    expiresInDays: 7,
    fields: {
      token: 'request_token',
      candidateName: 'candidate_name',
      candidateEmail: 'candidate_email',
    },
  },
} as const;

export type PreEmploymentFormKey = keyof typeof PRE_EMPLOYMENT_FORMS;

const REFERENCE_CHECK_FORM = {
  urlEnvKey: 'JOTFORM_REFERENCE_CHECK_FORM_URL',
  expiresInDays: 7,
  fields: {
    token: 'request_token',
    candidateName: 'candidate_name',
    candidatePosition: 'candidate_position',
    refereeName: 'referee_name',
    refereePosition: 'referee_position',
    refereeCompany: 'referee_company',
  },
} as const;

const EMPLOYMENT_VERIFICATION_FORM = {
  urlEnvKey: 'JOTFORM_EMPLOYMENT_VERIFICATION_FORM_URL',
  expiresInDays: 7,
  // These are URL-prefill field names, not Jotform's returned response keys.
  // Set the matching unique names on the employer-verification form.
  fields: {
    token: 'request_token',
    candidateName: 'candidate_name',
    candidatePosition: 'candidate_position',
    employerCompany: 'employer_company',
  },
} as const;

export function mintPreEmploymentRequestToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashPreEmploymentRequestToken(token) };
}

export function hashPreEmploymentRequestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function getPreEmploymentRequestExpiry(formKey: PreEmploymentFormKey, now = new Date()): string {
  const expiresAt = new Date(now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + PRE_EMPLOYMENT_FORMS[formKey].expiresInDays);
  return expiresAt.toISOString();
}

export function buildPreEmploymentFormUrl(args: {
  formKey: PreEmploymentFormKey;
  token: string;
  candidateName: string;
  candidateEmail: string;
}): string {
  const definition = PRE_EMPLOYMENT_FORMS[args.formKey];
  const rawUrl = process.env[definition.urlEnvKey]?.trim();
  if (!rawUrl) {
    throw new Error(`${definition.urlEnvKey} is not configured`);
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`${definition.urlEnvKey} must be a valid absolute URL`);
  }

  // The Jotform fields with these unique names must exist. They can be hidden
  // or read-only; the token is the only field trusted by the intake endpoint.
  url.searchParams.set(definition.fields.token, args.token);
  url.searchParams.set(definition.fields.candidateName, args.candidateName);
  url.searchParams.set(definition.fields.candidateEmail, args.candidateEmail);
  return url.toString();
}

export function getReferenceCheckRequestExpiry(now = new Date()): string {
  const expiresAt = new Date(now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + REFERENCE_CHECK_FORM.expiresInDays);
  return expiresAt.toISOString();
}

export function buildReferenceCheckFormUrl(args: {
  token: string;
  candidateName: string;
  candidatePosition: string;
  refereeName: string;
  refereePosition: string;
  refereeCompany: string;
}): string {
  const rawUrl = process.env[REFERENCE_CHECK_FORM.urlEnvKey]?.trim();
  if (!rawUrl) throw new Error(`${REFERENCE_CHECK_FORM.urlEnvKey} is not configured`);

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`${REFERENCE_CHECK_FORM.urlEnvKey} must be a valid absolute URL`);
  }

  for (const [field, value] of Object.entries({
    [REFERENCE_CHECK_FORM.fields.token]: args.token,
    [REFERENCE_CHECK_FORM.fields.candidateName]: args.candidateName,
    [REFERENCE_CHECK_FORM.fields.candidatePosition]: args.candidatePosition,
    [REFERENCE_CHECK_FORM.fields.refereeName]: args.refereeName,
    [REFERENCE_CHECK_FORM.fields.refereePosition]: args.refereePosition,
    [REFERENCE_CHECK_FORM.fields.refereeCompany]: args.refereeCompany,
  })) {
    url.searchParams.set(field, value);
  }
  return url.toString();
}

export function getEmploymentVerificationRequestExpiry(now = new Date()): string {
  const expiresAt = new Date(now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + EMPLOYMENT_VERIFICATION_FORM.expiresInDays);
  return expiresAt.toISOString();
}

export function buildEmploymentVerificationFormUrl(args: {
  token: string;
  candidateName: string;
  candidatePosition: string;
  employerCompany: string;
}): string {
  const rawUrl = process.env[EMPLOYMENT_VERIFICATION_FORM.urlEnvKey]?.trim();
  if (!rawUrl) throw new Error(`${EMPLOYMENT_VERIFICATION_FORM.urlEnvKey} is not configured`);
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new Error(`${EMPLOYMENT_VERIFICATION_FORM.urlEnvKey} must be a valid absolute URL`); }
  for (const [field, value] of Object.entries({
    [EMPLOYMENT_VERIFICATION_FORM.fields.token]: args.token,
    [EMPLOYMENT_VERIFICATION_FORM.fields.candidateName]: args.candidateName,
    [EMPLOYMENT_VERIFICATION_FORM.fields.candidatePosition]: args.candidatePosition,
    [EMPLOYMENT_VERIFICATION_FORM.fields.employerCompany]: args.employerCompany,
  })) url.searchParams.set(field, value);
  return url.toString();
}
