// Base URL for links we put in OUTBOUND content (emails, etc.). Such links must
// be externally clickable — never a localhost dev URL. An explicit non-localhost
// env override wins; an empty or localhost value falls back to the canonical
// production URL (see [[project_canonical_prod_url]]).
export const CANONICAL_BASE_URL = 'https://rs-tool-ticketing-system.vercel.app';

export function publicBaseUrl(): string {
  const raw = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  if (!raw || raw.includes('localhost') || raw.includes('127.0.0.1')) {
    return CANONICAL_BASE_URL;
  }
  return raw;
}
