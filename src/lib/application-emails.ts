// Emails for public job applications.
//
//  - The new-application notice goes to one fixed address (APPLICATION_NOTIFY_TO,
//    default hr@romega-solutions.com) through the existing n8n notify workflow.
//  - The applicant confirmation can be sent from the HR address through Resend.
//    It is OFF unless APPLICANT_ACK_MODE=hr; while it is off the applicant gets
//    the plain acknowledgement from the n8n communication workflow, as before.

import { CANONICAL_BASE_URL } from '@/lib/app-url';

export const DEFAULT_APPLICATION_NOTIFY_TO = 'hr@romega-solutions.com';

export const APPLICANT_FROM = 'Romega HR <hr@romega-solutions.com>';
export const APPLICANT_REPLY_TO = 'hr@romega-solutions.com';

// One font stack for every applicant email. Gmail and Outlook do not load web
// fonts, so most readers see Arial or Helvetica; the layout does not rely on
// Poppins being present.
export const EMAIL_FONT_STACK = "'Poppins', Arial, Helvetica, sans-serif";

const RESEND_URL = 'https://api.resend.com/emails';
const RESEND_TIMEOUT_MS = 8_000;

const EMAIL_PATTERN = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

// ─────────────────────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────────────────────

/** The one address that receives new-application notices. A missing or invalid value falls back to the default. */
export function getApplicationNotifyTo(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.APPLICATION_NOTIFY_TO?.trim().toLowerCase();
  if (raw && EMAIL_PATTERN.test(raw)) return raw;
  return DEFAULT_APPLICATION_NOTIFY_TO;
}

export type ApplicantAckMode = 'hr' | 'n8n';

/** 'hr' only when APPLICANT_ACK_MODE is exactly "hr" (any case). Anything else keeps the existing plain acknowledgement. */
export function getApplicantAckMode(env: NodeJS.ProcessEnv = process.env): ApplicantAckMode {
  return env.APPLICANT_ACK_MODE?.trim().toLowerCase() === 'hr' ? 'hr' : 'n8n';
}

// ─────────────────────────────────────────────────────────────────────────────
// Content
// ─────────────────────────────────────────────────────────────────────────────

export type ApplicantAckInput = {
  fullName:        string;
  role:            string;
  applicationCode: string | null;
};

export type BuiltEmail = {
  subject: string;
  html:    string;
  text:    string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Header values and plain text never carry line breaks or other control characters.
function singleLine(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function firstNameOf(fullName: string): string {
  const first = singleLine(fullName).split(' ')[0];
  return first || '';
}

export function buildApplicantAckEmail(input: ApplicantAckInput): BuiltEmail {
  const firstName = firstNameOf(input.fullName);
  const role      = singleLine(input.role) || 'the open position';
  const code      = input.applicationCode ? singleLine(input.applicationCode) : '';

  const subject = code
    ? `Application received — ${role} (${code})`
    : `Application received — ${role}`;

  const f         = EMAIL_FONT_STACK;
  const logoUrl   = `${CANONICAL_BASE_URL}/images/romega-email-logo.png`;
  const checkUrl  = `${CANONICAL_BASE_URL}/images/email-check.png`;
  const thanks    = firstName ? `Thank you, ${escapeHtml(firstName)}.` : 'Thank you for applying.';
  const eRole     = escapeHtml(role);
  const eCode     = escapeHtml(code);
  const eSubject  = escapeHtml(subject);

  const preheader = code
    ? `We received your application for ${role}. Your code is ${code}. We will get back to you in 5 to 7 business days.`
    : `We received your application for ${role}. We will get back to you in 5 to 7 business days.`;

  const codeCard = code
    ? `<tr><td align="center" class="px" style="padding:26px 40px 0 40px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" bgcolor="#eef5fc" style="background-color:#eef5fc;border:1px solid #d4e9f7;border-radius:10px"><tr><td align="center" style="padding:16px 36px 18px 36px">
    <div style="font-family:${f};font-size:14px;line-height:20px;color:#475569">Your application code</div>
    <div class="code" style="font-family:${f};font-size:28px;line-height:38px;font-weight:700;color:#154e8a;padding-top:2px;word-break:break-all">${eCode}</div>
  </td></tr></table></td></tr>
`
    : '';

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="x-apple-disable-message-reformatting" /><meta name="color-scheme" content="light only" /><meta name="supported-color-schemes" content="light only" />
<title>${eSubject}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><style type="text/css">table,td,p,a{font-family:Arial,sans-serif !important;}</style><![endif]-->
<style type="text/css">
body{margin:0;padding:0;width:100% !important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt} img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic} a{color:#1c5fa5}
@media only screen and (max-width:620px){.px{padding-left:22px !important;padding-right:22px !important}.code{font-size:24px !important}.sep{display:none !important}.logo{width:150px !important;height:auto !important}}
</style></head><body style="margin:0;padding:0;background-color:#f1f5f9"><div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9" style="background-color:#f1f5f9"><tr><td align="center" style="padding:24px 12px"><!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]--><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:14px;border-collapse:separate;overflow:hidden">
<tr><td align="left" class="px" style="padding:28px 40px 18px 40px;border-bottom:4px solid #febd18"><a href="https://www.romega-solutions.com" target="_blank" style="text-decoration:none"><img class="logo" src="${logoUrl}" width="150" alt="Romega Solutions" style="display:block;width:150px;height:auto;border:0;font-family:${f};font-size:18px;font-weight:700;color:#154e8a" /></a></td></tr>
<tr><td align="center" style="padding:30px 40px 0 40px"><img src="${checkUrl}" width="56" height="56" alt="" style="display:block;border:0;width:56px;height:56px" /></td></tr>
<tr><td align="center" class="px" style="padding:18px 40px 0 40px"><h1 style="margin:0;font-family:${f};font-size:26px;line-height:34px;font-weight:700;color:#1e293b">Application received</h1></td></tr>
<tr><td align="center" class="px" style="padding:12px 44px 0 44px;font-family:${f};font-size:16px;line-height:26px;color:#334155">${thanks} We have received your application for the <b style="color:#1e293b">${eRole}</b> position.</td></tr>
${codeCard}<tr><td align="center" class="px" style="padding:26px 44px 0 44px;font-family:${f};font-size:16px;line-height:26px;color:#334155">We&rsquo;ll get back to you in <b style="color:#1e293b;white-space:nowrap">5 to 7 business days</b>.</td></tr>
<tr><td align="center" class="px" style="padding:10px 44px 0 44px;font-family:${f};font-size:16px;line-height:26px;color:#334155">If you are a fit for the role, our team will get in touch with you.</td></tr>
<tr><td align="center" class="px" style="padding:24px 44px 34px 44px;font-family:${f};font-size:16px;line-height:26px;color:#334155">Best regards,<br />Romega Solutions team</td></tr>
<tr><td bgcolor="#0f2238" align="center" class="px" style="background-color:#0f2238;padding:28px 40px">
  <p style="margin:0;font-family:${f};font-size:14px;line-height:22px;font-weight:700;color:#ffffff">Romega Solutions</p>
  <p style="margin:4px 0 0;font-family:${f};font-size:13px;line-height:21px;color:#d4e9f7">222 Pacific Coast Hwy, #10, El Segundo, CA 90245</p>
  <p style="margin:8px 0 0;font-family:${f};font-size:13px;line-height:21px;color:#d4e9f7"><span style="white-space:nowrap"><a href="https://www.romega-solutions.com" target="_blank" style="color:#ffffff;text-decoration:underline">romega-solutions.com</a></span> <span class="sep">&nbsp;|&nbsp;</span> <span style="white-space:nowrap"><a href="mailto:${APPLICANT_REPLY_TO}" style="color:#ffffff;text-decoration:underline">${APPLICANT_REPLY_TO}</a></span></p>
</td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>`;

  const textLines = [
    firstName ? `Hi ${firstName},` : 'Hello,',
    '',
    `Thank you for applying for the ${role} position at Romega Solutions. We have received your application.`,
    '',
  ];
  if (code) {
    textLines.push(
      `Your application code: ${code}`,
      'Please keep this code and quote it if you write to us.',
      '',
    );
  }
  textLines.push(
    'What happens next',
    'Please allow 5 to 7 business days for feedback. If you are a fit for the role, our team will get in touch with you.',
    '',
    'Questions? Just reply to this email and our HR team will help.',
    '',
    'Romega Solutions',
    '222 Pacific Coast Hwy, #10, El Segundo, CA 90245',
    `https://www.romega-solutions.com | ${APPLICANT_REPLY_TO}`,
  );

  return { subject, html, text: textLines.join('\n') };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sending (Resend)
// ─────────────────────────────────────────────────────────────────────────────

export type SendApplicantAckInput = ApplicantAckInput & {
  to:              string;
  /** Sent as the Resend idempotency key so a retry cannot deliver twice. */
  idempotencyKey?: string;
};

export type SendApplicantAckResult =
  | { ok: true;  id: string | null }
  | {
      ok: false;
      error: string;
      /**
       * true when nothing was delivered for certain (no key, bad address, or the
       * provider rejected the request), so the caller can safely fall back to the
       * existing acknowledgement without the applicant getting two emails.
       * false when the outcome is unknown (timeout or network failure).
       */
      notSent: boolean;
    };

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Sends the confirmation through Resend. Never throws and never includes the key in an error. */
export async function sendApplicantAck(
  input: SendApplicantAckInput,
  deps: { env?: NodeJS.ProcessEnv; fetchImpl?: FetchLike } = {},
): Promise<SendApplicantAckResult> {
  const env = deps.env ?? process.env;
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, notSent: true, error: 'RESEND_API_KEY is not configured' };
  }
  const to = input.to.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(to)) {
    return { ok: false, notSent: true, error: 'Applicant email address is not valid' };
  }

  const email = buildApplicantAckEmail(input);
  const doFetch: FetchLike = deps.fetchImpl ?? ((url, init) => fetch(url, init));

  const headers: Record<string, string> = {
    Authorization:  `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (input.idempotencyKey) headers['Idempotency-Key'] = input.idempotencyKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);
  try {
    const res = await doFetch(RESEND_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        from:     APPLICANT_FROM,
        to:       [to],
        reply_to: APPLICANT_REPLY_TO,
        subject:  email.subject,
        html:     email.html,
        text:     email.text,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      // A 4xx means the request was refused and nothing was sent. A 5xx is
      // treated as unknown.
      return {
        ok: false,
        notSent: res.status >= 400 && res.status < 500,
        error: `Resend responded ${res.status}`,
      };
    }

    let id: string | null = null;
    try {
      const payload = (await res.json()) as { id?: unknown };
      if (typeof payload?.id === 'string') id = payload.id;
    } catch { /* an empty body is fine */ }
    return { ok: true, id };
  } catch (err) {
    clearTimeout(timer);
    return {
      ok: false,
      notSent: false,
      error: err instanceof Error ? err.message : 'network error',
    };
  }
}
