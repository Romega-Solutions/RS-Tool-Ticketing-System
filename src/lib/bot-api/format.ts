import { createHash } from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import { Parser } from 'htmlparser2';

export class ApiError extends Error {
  constructor(public status: number, public code: string, public msg: string, public retryAfter?: number) { super(code); }
}
export const unavailable = () => new ApiError(503, 'unavailable', 'Service unavailable');
export const invalid = () => new ApiError(400, 'invalid_request', 'Invalid request');
export const missing = () => new ApiError(404, 'not_found', 'Not found');
export function text(value: unknown, cap = 1500): { value: string; trunc: boolean } {
  let decoded = '';
  const safe = sanitizeHtml(String(value ?? ''), {
    allowedTags: ['p','div','br','li','h1','h2','h3','pre','blockquote'], allowedAttributes: {},
    nonTextTags: ['script', 'style', 'textarea', 'option'],
  });
  const parser = new Parser({ ontext: s => { decoded += s; }, onopentag: () => { decoded += ' '; }, onclosetag: () => { decoded += ' '; } }, { decodeEntities: true });
  parser.end(safe);
  const chars = Array.from(decoded.replace(/\s+/g, ' ').trim());
  return { value: chars.slice(0, cap).join(''), trunc: chars.length > cap };
}
export function safeUrl(value: unknown): string | null {
  try { const url = new URL(String(value)); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.href.length <= 2048 ? url.href : null; } catch { return null; }
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export function fingerprint(value: unknown) { return createHash('sha256').update(canonical(value)).digest('hex'); }
export function etag(value: unknown) { return `"${fingerprint(value)}"`; }
export function fields(raw: string | undefined, allowed: readonly string[]): string[] {
  if (raw === undefined) return [...allowed];
  const selected = raw.split(',');
  if (!selected.length || selected.some(f => !allowed.includes(f)) || new Set(selected).size !== selected.length) throw invalid();
  return allowed.filter(f => selected.includes(f));
}
export function project(row: Record<string, unknown>, selected: string[]) { return Object.fromEntries(selected.map(k => [k, row[k] ?? null])); }
export function compact(rows: Record<string, unknown>[], cols: string[], next: string | null) {
  return { cols, rows: rows.map(r => cols.map(c => r[c] ?? null)), next };
}
// Preserve database microseconds: millisecond-only tuples repeat rows during keyset paging.
export function utcTimestamp(value: unknown): string {
  if (typeof value !== 'string') throw unavailable();
  const match = /^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d(?::?\d\d)?)$/.exec(value);
  if (!match) throw unavailable();
  const zone = match[4] === 'Z' ? 'Z' : match[4].length === 3 ? `${match[4]}:00` : match[4];
  const date = new Date(`${match[1]}T${match[2]}.${(match[3] ?? '').padEnd(3, '0').slice(0,3)}${zone}`);
  if (!Number.isFinite(date.getTime())) throw unavailable();
  return date.toISOString().replace('Z', `${(match[3] ?? '').slice(3).padEnd(3, '0')}Z`);
}
export function encodeCursor(resource: string, filter: string, tuple: (string | number)[]) {
  return Buffer.from(JSON.stringify({ v: 1, resource, filter, tuple })).toString('base64url');
}
export function decodeCursor(raw: string | undefined, resource: string, filter: string, order: 'id' | 'sequence' | 'time'): (string | number)[] | null {
  if (!raw) return null;
  if (raw.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw invalid();
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString());
    const id = c.tuple?.at(-1);
    if (c.v !== 1 || c.resource !== resource || c.filter !== filter || !Array.isArray(c.tuple) ||
      c.tuple.length !== (order === 'id' ? 1 : 2) || !Number.isSafeInteger(id) || id <= 0 || id > 2147483647 ||
      (order === 'sequence' && (!Number.isSafeInteger(c.tuple[0]) || c.tuple[0] < -2147483648 || c.tuple[0] > 2147483647)) ||
      (order === 'time' && (typeof c.tuple[0] !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(c.tuple[0]) || utcTimestamp(c.tuple[0]) !== c.tuple[0]))) throw invalid();
    return c.tuple;
  } catch { throw invalid(); }
}
