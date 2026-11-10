// Which Supabase projects the preview-only tools (the "View as" role switcher
// and scripts/preview-seed) may ever talk to. Shared so both use the same
// rules. Pure: no Next.js, Supabase or Node-only imports.
//
// Fails closed: a project is allowed only when its ref, parsed from a
// standard https://<ref>.supabase.co URL, is on the explicit allowlist below.
// Production is always refused, even if it were ever added to the list.
// This is a hard-coded constant on purpose (no env var), so a Vercel setting
// can't widen it; adding a project means a reviewed code change.

export const PRODUCTION_SUPABASE_REF = 'cqyzzgfpjtyujjotezij';

/** Non-production projects the preview tools may use (rs-dev). */
export const NON_PRODUCTION_SUPABASE_REFS: readonly string[] = Object.freeze(['cgstmdpbzjuwwoudfeqk']);

const REF_PATTERN = /^[a-z0-9]{20}$/;

/**
 * Project ref from a standard Supabase project URL (https://<ref>.supabase.co,
 * optional trailing slash or path). Null for anything else: other schemes,
 * custom domains, ports, credentials, or a malformed URL.
 */
export function supabaseRefFromUrl(value: string | undefined | null): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
  const m = /^([a-z0-9]+)\.supabase\.co$/.exec(url.hostname.toLowerCase());
  return m && REF_PATTERN.test(m[1]) ? m[1] : null;
}

/** Project ref embedded in a legacy JWT key, if it is one (sb_secret_ keys carry none). */
export function jwtRef(key: string | undefined | null): string | null {
  const parts = String(key ?? '').trim().split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '='))) as { ref?: unknown };
    return typeof payload.ref === 'string' ? payload.ref.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** True when a URL, ref or key string points at the production project. */
export function mentionsProductionProject(value: string | undefined | null): boolean {
  if (!value) return false;
  if (value.toLowerCase().includes(PRODUCTION_SUPABASE_REF)) return true;
  return jwtRef(value) === PRODUCTION_SUPABASE_REF;
}

export type ProjectCheck =
  | { ok: true; ref: string }
  | { ok: false; reason: string };

/**
 * The single gate for preview tools: the URL must be a standard Supabase URL
 * whose ref is allowlisted and not production; the key (any type, including
 * sb_secret_) must not mention production; a legacy JWT key must belong to
 * the same project as the URL.
 */
export function checkNonProductionProject(url: string | undefined | null, key: string | undefined | null): ProjectCheck {
  if (mentionsProductionProject(url)) return { ok: false, reason: 'Supabase URL points at production' };
  const ref = supabaseRefFromUrl(url);
  if (!ref) return { ok: false, reason: 'Supabase URL is missing or not a https://<ref>.supabase.co URL' };
  if (ref === PRODUCTION_SUPABASE_REF) return { ok: false, reason: 'Supabase URL points at production' };
  if (!NON_PRODUCTION_SUPABASE_REFS.includes(ref)) return { ok: false, reason: 'Supabase project is not on the non-production allowlist' };
  if (!String(key ?? '').trim()) return { ok: false, reason: 'Supabase secret key is not configured' };
  if (mentionsProductionProject(key)) return { ok: false, reason: 'Supabase secret key belongs to production' };
  const keyRef = jwtRef(key);
  if (keyRef && keyRef !== ref) return { ok: false, reason: 'Supabase secret key belongs to a different project' };
  return { ok: true, ref };
}
