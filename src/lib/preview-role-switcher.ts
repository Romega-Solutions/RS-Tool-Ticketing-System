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
//   3. The Supabase URL must be https://<ref>.supabase.co with a ref on the
//      hard-coded non-production allowlist (never production), and the
//      secret key, of any type, must not belong to production or, for a
//      legacy JWT, to another project. See lib/supabase-project-guard.ts.
//   4. Only the five known @preview.invalid accounts can ever be signed into.
//
// This module has no Next.js or Supabase imports so every guard can be unit
// tested with a plain env object.

import { PREVIEW_ROLES, type PreviewRole } from '@/lib/preview-roles';
import { checkNonProductionProject } from '@/lib/supabase-project-guard';

export { PREVIEW_ROLES, PREVIEW_ROLE_LABELS, type PreviewRole } from '@/lib/preview-roles';
export {
  PRODUCTION_SUPABASE_REF, NON_PRODUCTION_SUPABASE_REFS, mentionsProductionProject,
} from '@/lib/supabase-project-guard';

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

type Env = Record<string, string | undefined>;

export type SwitcherStatus =
  | { enabled: true }
  | { enabled: false; reason: string };

function evaluate(env: Env): SwitcherStatus {
  if (env.VERCEL_ENV !== 'preview') {
    return { enabled: false, reason: 'not a Vercel preview deployment' };
  }
  if (env.PREVIEW_ROLE_SWITCHER !== 'true') {
    return { enabled: false, reason: 'PREVIEW_ROLE_SWITCHER is not "true"' };
  }
  const project = checkNonProductionProject(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);
  if (!project.ok) return { enabled: false, reason: project.reason };
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
