// Safety checks for the preview seed. Pure functions so they can be unit
// tested without touching any database.

import {
  PRODUCTION_SUPABASE_REF, checkNonProductionProject, jwtRef, mentionsProductionProject,
} from '../../src/lib/supabase-project-guard';

export { PRODUCTION_SUPABASE_REF, jwtRef };
export const SEED_EMAIL_DOMAIN = '@preview.invalid';
export const SEED_MARKER = '[preview-seed]';

const REF_PATTERN = /^[a-z0-9]{20}$/;

/** Project ref from a Supabase URL (https://<ref>.supabase.co) or a bare ref. */
export function supabaseRef(value: string | undefined | null): string | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;
  if (REF_PATTERN.test(raw)) return raw;
  try {
    const host = new URL(raw).host;
    const first = host.split('.')[0];
    return REF_PATTERN.test(first) ? first : null;
  } catch {
    return null;
  }
}

export type TargetInput = {
  /** Value of the required --target flag (a project ref or URL). */
  targetFlag: string | undefined;
  targetUrl: string | undefined;
  targetKey: string | undefined;
  /** Source (read-only) URL, when reading structure live. */
  sourceUrl?: string | undefined;
};

export type TargetCheck =
  | { ok: true; ref: string; url: string }
  | { ok: false; error: string };

/**
 * Decides whether the seed may write to the target. Refuses production, the
 * source project, a missing/mismatched --target flag, and missing secrets.
 */
export function checkTarget(input: TargetInput): TargetCheck {
  const flagRef = supabaseRef(input.targetFlag);
  if (!input.targetFlag || !flagRef) {
    return { ok: false, error: 'An explicit --target <project-ref> flag is required.' };
  }
  const url = String(input.targetUrl ?? '').trim();
  const urlRef = supabaseRef(url);
  if (!url || !urlRef) {
    return { ok: false, error: 'TARGET_SUPABASE_URL is missing or not a Supabase project URL.' };
  }
  if (!input.targetKey?.trim()) {
    return { ok: false, error: 'TARGET_SUPABASE_SECRET_KEY is missing.' };
  }
  if (
    flagRef === PRODUCTION_SUPABASE_REF
    || urlRef === PRODUCTION_SUPABASE_REF
    || mentionsProductionProject(input.targetFlag)
    || mentionsProductionProject(url)
    || mentionsProductionProject(input.targetKey)
  ) {
    return { ok: false, error: 'Refusing to write: the target is the production project.' };
  }
  // Same allowlist as the preview role switcher: only known non-production
  // projects, standard URL only, and the key must not belong elsewhere.
  const project = checkNonProductionProject(url, input.targetKey);
  if (!project.ok) {
    return { ok: false, error: `Refusing to write: ${project.reason}.` };
  }
  if (flagRef !== urlRef) {
    return { ok: false, error: `--target (${flagRef}) does not match TARGET_SUPABASE_URL (${urlRef}).` };
  }
  const keyRef = jwtRef(input.targetKey);
  if (keyRef && keyRef !== urlRef) {
    return { ok: false, error: 'TARGET_SUPABASE_SECRET_KEY belongs to a different project than TARGET_SUPABASE_URL.' };
  }
  const sourceRef = supabaseRef(input.sourceUrl);
  if (sourceRef && sourceRef === urlRef) {
    return { ok: false, error: 'Refusing to write: the target is the same project as the source.' };
  }
  return { ok: true, ref: urlRef, url };
}

export function isSeedEmail(email: unknown): boolean {
  return typeof email === 'string' && email.trim().toLowerCase().endsWith(SEED_EMAIL_DOMAIN);
}
