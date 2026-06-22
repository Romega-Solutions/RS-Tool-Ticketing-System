// Typed client for the self-hosted n8n "Romega ATS — Resume Extractor (Regex, No API Key)"
// workflow. No external AI API keys needed — extraction is pure regex inside n8n.
//
// Workflow JSON: n8n/Romega ATS — Resume Extractor (Regex, No API Key).json
// Form trigger fields: "Resume File" (file, required, PDF only), "Candidate ID" (text, optional).
// PDF only: DOCX text extraction needs node modules (zlib / jszip / adm-zip) that the
// n8n Code sandbox blocks by default. To allow DOCX, set
//   NODE_FUNCTION_ALLOW_EXTERNAL=jszip
// in your n8n container env and restart, then update the workflow + this client.
//
// The workflow MUST be configured with `responseMode: 'responseNode'` on its
// Form Trigger, with a "Respond to Webhook" node returning the parsed JSON.
// The shipped JSON in this repo already has that wiring.

export type ParsedExperience = {
  company:     string | null;
  title:       string | null;
  start_date:  string | null;
  end_date:    string | null;
  description: string | null;
};

export type ParsedEducation = {
  institution:     string | null;
  degree:          string | null;
  field:           string | null;
  graduation_year: string | null;
};

export type ParsedResume = {
  full_name:      string | null;
  email:          string | null;
  phone:          string | null;
  location:       string | null;
  linkedin:       string | null;
  website:        string | null;
  summary:        string | null;
  skills:         string[];
  experience:     ParsedExperience[];
  education:      ParsedEducation[];
  certifications: string[];
  languages:      string[];
};

export type ResumeParseSuccess = {
  success: true;
  data:    ParsedResume;
};

export type ResumeParseFailure = {
  success: false;
  error:   string;
  code:    string;
};

export type ResumeParseResult = ResumeParseSuccess | ResumeParseFailure;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // matches the n8n validator's 10 MB cap

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
]);

export function getResumeParserUrl(): string {
  const url = process.env.N8N_RESUME_PARSER_URL;
  if (!url) {
    throw new Error('N8N_RESUME_PARSER_URL is not configured. Add it to .env.');
  }
  return url;
}

// ─────────────────────────────────────────────────────────────────────────────
// Candidate Communication webhook — drives the n8n "Romega ATS — Candidate
// Communication" workflow which sends Gmail templates keyed off candidate
// status. Configured via N8N_COMMUNICATION_WEBHOOK_URL.
// ─────────────────────────────────────────────────────────────────────────────

export type CommunicationEvent =
  | { kind: 'created';        candidateId: number }
  | { kind: 'status_changed'; candidateId: number; status: string }
  | { kind: 'resend';         candidateId: number; template: string }
  // GDPR Talent Pool consent request. n8n emails the candidate a one-click
  // confirm link; clicking it records consent. See docs/N8N_TALENT_CONSENT.md.
  | { kind: 'talent_consent_request';
      candidateId:    number;
      candidateName:  string;
      candidateEmail: string;
      confirmUrl:     string };

export type CommunicationResult =
  | { ok: true;  template?: string }
  | { ok: false; error: string };

function getCommunicationWebhookUrl(): string | null {
  return process.env.N8N_COMMUNICATION_WEBHOOK_URL?.trim() || null;
}

/**
 * Fire the n8n communication workflow. Caller decides what to do with the
 * failure result (typically logs an `email_failed` history row).
 *
 * Intentionally NOT thrown — the candidate update should succeed even when
 * the email pipeline is down. The recruiter sees a clear failure trail in
 * candidate_history and can manually retry.
 */
export async function notifyCommunicationWebhook(
  event: CommunicationEvent,
): Promise<CommunicationResult> {
  const url = getCommunicationWebhookUrl();
  if (!url) {
    return { ok: false, error: 'N8N_COMMUNICATION_WEBHOOK_URL is not configured' };
  }

  // 8s ceiling — long enough for n8n's slow first-fire cold start, short
  // enough that a wedged webhook doesn't stall the recruiter's UI.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(event),
      signal:  controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return { ok: false, error: `n8n responded ${res.status}` };
    }

    let payload: unknown = null;
    try { payload = await res.json(); } catch { /* empty body is OK */ }
    const template = (payload as { template?: unknown })?.template;
    return { ok: true, template: typeof template === 'string' ? template : undefined };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'network error',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Recruiter notification webhook — pings the assigned recruiter when a new
// public application lands. Separate from the candidate-comms pipeline so it
// can be authored as its own n8n workflow (Gmail/Slack/whatever). If
// N8N_RECRUITER_NOTIFY_URL is unset the call is a no-op.
// ─────────────────────────────────────────────────────────────────────────────

export type RecruiterNotifyPayload = {
  candidateId:     number;
  candidateName:   string;
  candidateEmail:  string;
  candidatePhone:  string | null;
  applicationCode: string | null;
  positionId:      number;
  positionTitle:   string;
  recruiterUserId: number | null;
  recruiterEmail:  string | null;
  recruiterName:   string | null;
  /** Everyone n8n should email the CV to — the HR team plus the assigned
   *  recruiter, deduped. The n8n workflow uses this as its To/Bcc list. */
  recipients:      string[];
  /** Signed download URL for the uploaded resume PDF (null if upload failed),
   *  so the n8n workflow can attach or link the CV. */
  resumeUrl:       string | null;
};

export async function notifyRecruiterOfApplication(
  payload: RecruiterNotifyPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = process.env.N8N_RECRUITER_NOTIFY_URL?.trim();
  if (!url) {
    return { ok: false, error: 'N8N_RECRUITER_NOTIFY_URL is not configured' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      signal:  controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, error: `n8n responded ${res.status}` };
    return { ok: true };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, error: err instanceof Error ? err.message : 'network error' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding webhooks — drives the four MVP n8n workflows that send the SOP
// emails (BG-check ask, reference request, employment verification, welcome).
// Same fire-and-forget-but-recorded pattern as the candidate communication
// pipeline above. Each template resolves to its own env var so individual
// workflows can be deployed independently.
// ─────────────────────────────────────────────────────────────────────────────

export type OnboardingTemplate =
  | 'bg-check-initiate'
  | 'reference-request'
  | 'employment-verification'
  | 'welcome'
  // Post-MVP — left in the type so action layer doesn't need to be
  // re-edited when the workflows ship:
  | 'gmail-signature-nudge'
  | 'group-chat-announce'
  | 'sow-reminder'
  | '30-day-checkin'
  | '90-day-review';

export type OnboardingEvent = {
  onboarderId: number;
  template:    OnboardingTemplate;
  event:       'status_changed' | 'manual_send' | 'scheduled_sweep';
  // Free-form context substituted into the template by n8n. The MVP uses
  // these keys: onboarder_type, full_name, first_name, role_title, team,
  // start_date, direct_supervisor, onboarding_lead, chief_of_staff,
  // referee_id, referee_name, referee_email, verification_id, hr_email.
  context?:    Record<string, unknown>;
};

export type OnboardingResult =
  | { ok: true;  template?: string }
  | { ok: false; error: string };

const ONBOARDING_TEMPLATE_ENV: Record<OnboardingTemplate, string> = {
  'bg-check-initiate':       'N8N_BG_CHECK_INITIATE_URL',
  'reference-request':       'N8N_REFERENCE_REQUEST_URL',
  'employment-verification': 'N8N_EMPLOYMENT_VERIFICATION_URL',
  'welcome':                 'N8N_ONBOARDING_WELCOME_URL',
  // Post-MVP envs — declared so the helper stays exhaustive; resolution
  // falls back to null and the caller records `email_failed` in history.
  'gmail-signature-nudge':   'N8N_GMAIL_SIGNATURE_NUDGE_URL',
  'group-chat-announce':     'N8N_GROUP_CHAT_ANNOUNCE_URL',
  'sow-reminder':            'N8N_SOW_REMINDER_URL',
  '30-day-checkin':          'N8N_30DAY_CHECKIN_URL',
  '90-day-review':           'N8N_90DAY_REVIEW_URL',
};

export function getOnboardingWebhookUrl(template: OnboardingTemplate): string | null {
  const key = ONBOARDING_TEMPLATE_ENV[template];
  return process.env[key]?.trim() || null;
}

/**
 * Fire an n8n onboarding workflow. Mirrors notifyCommunicationWebhook above:
 *   - returns a typed result (never throws)
 *   - 8s ceiling so a wedged workflow doesn't stall the lead's UI
 *   - missing env var ⇒ ok:false with a clear error (caller writes to history)
 */
export async function notifyOnboardingWebhook(
  event: OnboardingEvent,
): Promise<OnboardingResult> {
  const url = getOnboardingWebhookUrl(event.template);
  if (!url) {
    return { ok: false, error: `${ONBOARDING_TEMPLATE_ENV[event.template]} is not configured` };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(event),
      signal:  controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return { ok: false, error: `n8n responded ${res.status}` };
    }

    let payload: unknown = null;
    try { payload = await res.json(); } catch { /* empty body is OK */ }
    const template = (payload as { template?: unknown })?.template;
    return { ok: true, template: typeof template === 'string' ? template : event.template };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'network error',
    };
  }
}

export async function parseResumeWithN8n(
  file: File,
  candidateId?: string | number,
): Promise<ResumeParseResult> {
  if (!file || file.size === 0) {
    return { success: false, code: 'EMPTY_FILE', error: 'No file provided.' };
  }
  if (file.size > MAX_FILE_BYTES) {
    return {
      success: false,
      code: 'FILE_TOO_LARGE',
      error: `${(file.size / 1024 / 1024).toFixed(1)} MB exceeds the 10 MB limit.`,
    };
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return {
      success: false,
      code: 'INVALID_FILE_TYPE',
      error: file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ? 'Word documents are not supported yet. Save your resume as PDF and try again.'
        : `Got "${file.type || 'unknown'}". Only PDF is accepted.`,
    };
  }

  const url = getResumeParserUrl();

  // n8n's Form Trigger names binary keys after the visible field labels.
  // The regex workflow uses "Resume File" and "Candidate ID" (with the space).
  const body = new FormData();
  body.append('Resume File', file, file.name);
  if (candidateId !== undefined && candidateId !== null) {
    body.append('Candidate ID', String(candidateId));
  }

  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', body });
  } catch (err) {
    return {
      success: false,
      code: 'NETWORK_ERROR',
      error: `Could not reach n8n: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return {
      success: false,
      code: 'INVALID_RESPONSE',
      error: `n8n returned non-JSON (status ${res.status}).`,
    };
  }

  const p = payload as {
    success?: boolean;
    error?:   string;
    code?:    string;
    data?:    Partial<ParsedResume>;
  };

  if (!p.success) {
    return {
      success: false,
      code: (p.code ?? 'UNKNOWN_ERROR').trim(),
      error: (p.error ?? `n8n responded with ${res.status}`).trim(),
    };
  }

  return { success: true, data: normalize(p.data ?? {}) };
}

function normalize(d: Partial<ParsedResume>): ParsedResume {
  return {
    full_name:      d.full_name      ?? null,
    email:          d.email          ?? null,
    phone:          d.phone          ?? null,
    location:       d.location       ?? null,
    linkedin:       d.linkedin       ?? null,
    website:        d.website        ?? null,
    summary:        d.summary        ?? null,
    skills:         Array.isArray(d.skills)         ? d.skills.filter(Boolean) as string[] : [],
    experience:     Array.isArray(d.experience)     ? (d.experience as ParsedExperience[]) : [],
    education:      Array.isArray(d.education)      ? (d.education as ParsedEducation[])   : [],
    certifications: Array.isArray(d.certifications) ? d.certifications.filter(Boolean) as string[] : [],
    languages:      Array.isArray(d.languages)      ? d.languages.filter(Boolean) as string[] : [],
  };
}
