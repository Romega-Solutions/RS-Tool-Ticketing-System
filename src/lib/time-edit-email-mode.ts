// Rollout switches for the time-correction emails (pure, no I/O).
//
//   N8N_HTML_EMAIL_URL          webhook of an HTML-capable sender. Unset means
//                               the new emails do not exist and everything
//                               behaves exactly as before.
//   TIME_EDIT_EMAILS_MODE       'log' (default) | 'send' | 'off'
//   TIME_EDIT_EMAILS_TEST_TO    one address; when set, every message goes only
//                               there, with no CC and a [TEST] subject prefix.
//
// The new emails are only actually sent when the plan below says 'send'. That
// is also the only case in which the old plain "decided" email is switched
// off, so a requester gets exactly one decision email: the new one when the new
// path sends, the old one otherwise.

export type TimeEditEmailMode = 'log' | 'send' | 'off';

export type TimeEditEmailPlan =
  | { action: 'off' | 'log'; reason: string }
  | { action: 'send'; testTo: string | null };

type Env = Record<string, string | undefined>;

/** TIME_EDIT_EMAILS_MODE: 'send' sends; 'off' does nothing; anything else is log-only. */
export function timeEditEmailMode(raw: string | undefined): TimeEditEmailMode {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'send' || v === 'off') return v;
  return 'log';
}

const EMAIL_RE = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** True for a single, plainly formed email address. */
export function isValidEmailAddress(raw: string | null | undefined): boolean {
  return EMAIL_RE.test(String(raw ?? '').trim());
}

/** A single usable test address, or null. */
export function parseTestAddress(raw: string | undefined): string | null {
  const v = String(raw ?? '').trim();
  return isValidEmailAddress(v) ? v : null;
}

/**
 * What the new time-correction emails do in this environment.
 *   - no HTML webhook configured → off (today's behavior, nothing new)
 *   - mode off → off; mode log (default) → log only
 *   - mode send with a test address → send, only to that address, but never in
 *     production (a test address is for previews only; in production it means
 *     log only, so real requesters keep the plain decision email)
 *   - mode send in production → send to the real recipients
 *   - mode send anywhere else (preview, local) without a test address → log only
 */
export function resolveTimeEditEmailPlan(env: Env = process.env): TimeEditEmailPlan {
  if (!String(env.N8N_HTML_EMAIL_URL ?? '').trim()) {
    return { action: 'off', reason: 'N8N_HTML_EMAIL_URL is not set' };
  }
  const mode = timeEditEmailMode(env.TIME_EDIT_EMAILS_MODE);
  if (mode === 'off') return { action: 'off', reason: 'mode is off' };
  if (mode === 'log') return { action: 'log', reason: 'mode is log' };

  const testTo = parseTestAddress(env.TIME_EDIT_EMAILS_TEST_TO);
  if (testTo) {
    if (env.VERCEL_ENV === 'production') return { action: 'log', reason: 'a test address is not used in production' };
    return { action: 'send', testTo };
  }
  if (String(env.TIME_EDIT_EMAILS_TEST_TO ?? '').trim()) {
    return { action: 'log', reason: 'the test address is not a valid email address' };
  }
  if (env.VERCEL_ENV === 'production') return { action: 'send', testTo: null };
  return { action: 'log', reason: 'not production and no test address is set' };
}

/** True when the new emails really send, so the old plain decided email must not. */
export function timeEditEmailsReplaceDecided(env: Env = process.env): boolean {
  return resolveTimeEditEmailPlan(env).action === 'send';
}
