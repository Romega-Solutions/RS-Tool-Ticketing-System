// Preview-only role switcher.
//
// On Vercel Preview deployments, reviewers can sign in as one of five fake test
// accounts (one per role) instead of typing a password. Every check here runs
// on the server, on every request, and fails closed: if anything is missing,
// unexpected or throws, the switcher is treated as disabled and the route 404s.
//
// The guards:
//   1. VERCEL_ENV must be exactly 'preview' (Vercel sets this; production is
//      'production', local dev has none).
//   2. PREVIEW_ROLE_SWITCHER must be exactly 'true'. This is a server-only env
//      var (no NEXT_PUBLIC_ prefix), so it is never bundled into the browser.
//   3. The Supabase project must not be the production project. Both the URL
//      and, when it is a legacy JWT, the secret key's project ref are checked.
//   4. Only the five known @preview.invalid accounts can ever be signed into.
//
// This module has no Next.js or Supabase imports so every guard can be unit
// tested with a plain env object.

import { PREVIEW_ROLES, type PreviewRole } from '@/lib/preview-roles';

export { PREVIEW_ROLES, PREVIEW_ROLE_LABELS, type PreviewRole } from '@/lib/preview-roles';

export const PREVIEW_EMAIL_DOMAIN = '@preview.invalid';

// The only accounts the switcher can sign into. Created by
// scripts/preview-seed on the preview database, never on production.
export const PREVIEW_ROLE_EMAILS: Readonly<Record<PreviewRole, string>> = Object.freeze({
  founder: 'founder@preview.invalid',
  admin: 'admin@preview.invalid',
  lead: 'lead@preview.invalid',
  ic: 'ic@preview.invalid',
  intern: 'intern@preview.invalid',
});

export const PRODUCTION_SUPABASE_REF = 'cqyzzgfpjtyujjotezij';

type Env = Record<string, string | undefined>;

export type SwitcherStatus =
  | { enabled: true }
  | { enabled: false; reason: string };

function decodeJwtRef(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { ref?: unknown };
    return typeof payload.ref === 'string' ? payload.ref : null;
  } catch {
    return null;
  }
}

/** True when a Supabase URL or key string points at the production project. */
export function mentionsProductionProject(value: string | undefined | null): boolean {
  if (!value) return false;
  if (value.toLowerCase().includes(PRODUCTION_SUPABASE_REF)) return true;
  return decodeJwtRef(value)?.toLowerCase() === PRODUCTION_SUPABASE_REF;
}

function evaluate(env: Env): SwitcherStatus {
  if (env.VERCEL_ENV !== 'preview') {
    return { enabled: false, reason: 'not a Vercel preview deployment' };
  }
  if (env.PREVIEW_ROLE_SWITCHER !== 'true') {
    return { enabled: false, reason: 'PREVIEW_ROLE_SWITCHER is not "true"' };
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) {
    return { enabled: false, reason: 'Supabase URL is not configured' };
  }
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return { enabled: false, reason: 'Supabase URL is not a valid URL' };
  }
  if (mentionsProductionProject(url) || mentionsProductionProject(host)) {
    return { enabled: false, reason: 'Supabase URL points at production' };
  }
  const secret = env.SUPABASE_SECRET_KEY?.trim();
  if (!secret) {
    return { enabled: false, reason: 'Supabase secret key is not configured' };
  }
  if (mentionsProductionProject(secret)) {
    return { enabled: false, reason: 'Supabase secret key belongs to production' };
  }
  return { enabled: true };
}

/** Server-side gate. Never throws: any error means disabled. */
export function previewRoleSwitcherStatus(env: Env = process.env): SwitcherStatus {
  try {
    return evaluate(env);
  } catch {
    return { enabled: false, reason: 'guard check failed' };
  }
}

export function isPreviewRoleSwitcherEnabled(env: Env = process.env): boolean {
  return previewRoleSwitcherStatus(env).enabled;
}

export function isPreviewRole(value: unknown): value is PreviewRole {
  return typeof value === 'string' && (PREVIEW_ROLES as readonly string[]).includes(value);
}

/** True only for the five known test accounts. */
export function isAllowedPreviewEmail(email: unknown): email is string {
  if (typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized.endsWith(PREVIEW_EMAIL_DOMAIN)) return false;
  return (Object.values(PREVIEW_ROLE_EMAILS) as string[]).includes(normalized);
}

/** Role → test account email, or null for anything that isn't a known role. */
export function previewEmailForRole(role: unknown): string | null {
  if (!isPreviewRole(role)) return null;
  const email = PREVIEW_ROLE_EMAILS[role];
  return isAllowedPreviewEmail(email) ? email : null;
}

/** Which test role an email belongs to, if any (used to label the in-app switcher). */
export function previewRoleForEmail(email: unknown): PreviewRole | null {
  if (!isAllowedPreviewEmail(email)) return null;
  const normalized = email.trim().toLowerCase();
  return PREVIEW_ROLES.find((r) => PREVIEW_ROLE_EMAILS[r] === normalized) ?? null;
}
