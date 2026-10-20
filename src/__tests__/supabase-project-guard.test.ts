import { describe, expect, it } from 'vitest';
import {
  NON_PRODUCTION_SUPABASE_REFS, PRODUCTION_SUPABASE_REF, checkNonProductionProject, jwtRef, supabaseRefFromUrl,
} from '@/lib/supabase-project-guard';
import { previewRoleSwitcherStatus } from '@/lib/preview-role-switcher';
import { checkTarget } from '../../scripts/preview-seed/guards';

const DEV_REF = 'cgstmdpbzjuwwoudfeqk';
const DEV_URL = `https://${DEV_REF}.supabase.co`;
const PROD_URL = `https://${PRODUCTION_SUPABASE_REF}.supabase.co`;
const UNKNOWN_URL = 'https://abcdefghijklmnopqrst.supabase.co';
const SB_SECRET = 'sb_secret_preview_only';

function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature`;
}

describe('non-production allowlist', () => {
  it('is only rs-dev and never production', () => {
    expect(NON_PRODUCTION_SUPABASE_REFS).toEqual([DEV_REF]);
    expect(NON_PRODUCTION_SUPABASE_REFS).not.toContain(PRODUCTION_SUPABASE_REF);
    expect(Object.isFrozen(NON_PRODUCTION_SUPABASE_REFS)).toBe(true);
  });
});

describe('supabaseRefFromUrl', () => {
  it('parses the ref from a standard project URL', () => {
    expect(supabaseRefFromUrl(DEV_URL)).toBe(DEV_REF);
    expect(supabaseRefFromUrl(`${DEV_URL}/`)).toBe(DEV_REF);
    expect(supabaseRefFromUrl(`  ${DEV_URL.toUpperCase()}  `)).toBe(DEV_REF);
  });
  it.each([
    undefined, null, '', 'not a url', DEV_REF, `http://${DEV_REF}.supabase.co`, `https://${DEV_REF}.supabase.co:8443`,
    `https://user:pw@${DEV_REF}.supabase.co`, `https://${DEV_REF}.supabase.co.evil.com`, `https://x.${DEV_REF}.supabase.co`,
    'https://short.supabase.co', `https://proxy.example.com/${DEV_REF}`,
  ])('rejects %s', (value) => {
    expect(supabaseRefFromUrl(value)).toBeNull();
  });
});

describe('checkNonProductionProject', () => {
  it('allows the allowlisted rs-dev ref', () => {
    expect(checkNonProductionProject(DEV_URL, SB_SECRET)).toEqual({ ok: true, ref: DEV_REF });
  });
  it('rejects the production ref', () => {
    expect(checkNonProductionProject(PROD_URL, SB_SECRET)).toEqual({ ok: false, reason: 'Supabase URL points at production' });
  });
  it('rejects an unknown ref', () => {
    expect(checkNonProductionProject(UNKNOWN_URL, SB_SECRET))
      .toEqual({ ok: false, reason: 'Supabase project is not on the non-production allowlist' });
  });
  it.each([undefined, '', 'not a url', 'https://example.com', `ftp://${DEV_REF}.supabase.co`])('rejects a missing or malformed URL: %s', (url) => {
    expect(checkNonProductionProject(url, SB_SECRET).ok).toBe(false);
  });
  it('sb_secret_ key with the production URL → rejected', () => {
    expect(checkNonProductionProject(PROD_URL, 'sb_secret_abc123').ok).toBe(false);
  });
  it('sb_secret_ key with the rs-dev URL → allowed', () => {
    expect(checkNonProductionProject(DEV_URL, 'sb_secret_abc123')).toEqual({ ok: true, ref: DEV_REF });
  });
  it('keeps the legacy JWT ref checks', () => {
    expect(checkNonProductionProject(DEV_URL, jwt({ ref: PRODUCTION_SUPABASE_REF })))
      .toEqual({ ok: false, reason: 'Supabase secret key belongs to production' });
    expect(checkNonProductionProject(DEV_URL, jwt({ ref: 'abcdefghijklmnopqrst' })))
      .toEqual({ ok: false, reason: 'Supabase secret key belongs to a different project' });
    expect(checkNonProductionProject(DEV_URL, jwt({ ref: DEV_REF }))).toEqual({ ok: true, ref: DEV_REF });
    expect(jwtRef(jwt({ ref: 'ABC' }))).toBe('abc');
  });
  it('rejects a missing key, or a key that mentions production', () => {
    expect(checkNonProductionProject(DEV_URL, undefined).ok).toBe(false);
    expect(checkNonProductionProject(DEV_URL, `sb_secret_${PRODUCTION_SUPABASE_REF}`).ok).toBe(false);
  });
});

describe('both preview tools use the same allowlist', () => {
  const env = { VERCEL_ENV: 'preview', PREVIEW_ROLE_SWITCHER: 'true', SUPABASE_SECRET_KEY: SB_SECRET };
  const seed = (targetUrl: string, targetFlag: string) => checkTarget({ targetFlag, targetUrl, targetKey: SB_SECRET });

  it('role switcher: rs-dev on, production and unknown projects off', () => {
    expect(previewRoleSwitcherStatus({ ...env, NEXT_PUBLIC_SUPABASE_URL: DEV_URL })).toEqual({ enabled: true });
    expect(previewRoleSwitcherStatus({ ...env, NEXT_PUBLIC_SUPABASE_URL: PROD_URL }).enabled).toBe(false);
    expect(previewRoleSwitcherStatus({ ...env, NEXT_PUBLIC_SUPABASE_URL: UNKNOWN_URL }))
      .toEqual({ enabled: false, reason: 'Supabase project is not on the non-production allowlist' });
  });

  it('seed: rs-dev allowed, production and unknown projects refused', () => {
    expect(seed(DEV_URL, DEV_REF)).toEqual({ ok: true, ref: DEV_REF, url: DEV_URL });
    expect(seed(PROD_URL, PRODUCTION_SUPABASE_REF).ok).toBe(false);
    expect(seed(UNKNOWN_URL, 'abcdefghijklmnopqrst'))
      .toEqual({ ok: false, error: 'Refusing to write: Supabase project is not on the non-production allowlist.' });
  });
});
