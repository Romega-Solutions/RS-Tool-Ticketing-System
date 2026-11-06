import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface ApiKey {
  id: number; label: string; key_prefix: string; key_hash: string;
  scopes: string[]; project_ids: number[]; rate_read_per_min: number;
  expires_at: string; revoked_at: string | null; last_used_at: string | null;
}
export const KEY_COLUMNS = 'id,label,key_prefix,key_hash,scopes,project_ids,rate_read_per_min,expires_at,revoked_at,last_used_at';
export function parseKey(token: string): { prefix: string } | null {
  const match = /^rsb_live_([A-Za-z0-9_-]{8})_([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match || Buffer.from(match[2], 'base64url').toString('base64url') !== match[2]) return null;
  return { prefix: match[1] };
}
export function generateKey() {
  const prefix = randomBytes(6).toString('base64url');
  return { prefix, token: `rsb_live_${prefix}_${randomBytes(32).toString('base64url')}` };
}
export function pepper(): string {
  const value = process.env.BOT_API_KEY_PEPPER;
  if (!value) throw new Error('configuration_unavailable');
  return value;
}
export function hashKey(token: string, secret = pepper()): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}
export function verifyKey(token: string, row: ApiKey | null, secret = pepper(), now = Date.now()): boolean {
  const actual = Buffer.from(hashKey(token, secret), 'hex');
  const validDigest = !!row && /^[a-f0-9]{64}$/.test(row.key_hash);
  const expected = Buffer.from(validDigest ? row!.key_hash : '0'.repeat(64), 'hex');
  const equal = timingSafeEqual(actual, expected);
  return equal && validDigest && !!parseKey(token) && !!row && !row.revoked_at &&
    Number.isFinite(Date.parse(row.expires_at)) && Date.parse(row.expires_at) > now;
}
