import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { KEY_COLUMNS, parseKey, pepper, verifyKey, type ApiKey } from './keys';
import { ApiError, etag, unavailable } from './format';
import { rateHit } from './rate-limit';
import { audit } from './audit';

export interface ReadContext { db: SupabaseClient; key: ApiKey; req: Request; params: Record<string, string>; }
export interface Representation { data: unknown; untrusted: string[]; }
type RouteContext = { params: Promise<Record<string, string>> };
type Handler = (context: ReadContext) => Promise<Representation>;
export function botRoute(scope: 'tasks:read', handler: Handler, pattern: string) {
  return async (req: Request, context?: RouteContext): Promise<Response> => {
    const rid = randomUUID(), started = performance.now();
    const headers = new Headers({ 'X-Request-Id': rid, 'Cache-Control': 'private, no-store', Vary: 'Authorization' });
    let db: SupabaseClient | undefined, key: ApiKey | null = null, status = 200, code: string | undefined, body: unknown;
    let params: Record<string, string> = {};
    try {
      db = createAdminClient();
      if (req.method !== 'GET') { headers.set('Allow', 'GET'); throw new ApiError(405, 'method_not_allowed', 'Method not allowed'); }
      if (req.headers.has('Origin')) throw new ApiError(403, 'origin_denied', 'Browser requests are not allowed');
      const secret = pepper();
      const auth = req.headers.get('Authorization') ?? '';
      const token = /^Bearer ([^ ]+)$/.exec(auth)?.[1] ?? '';
      const parsed = parseKey(token);
      let candidate: ApiKey | null = null;
      if (parsed) {
        const result = await db.from('api_keys').select(KEY_COLUMNS).eq('key_prefix', parsed.prefix).maybeSingle();
        if (result.error) throw unavailable();
        candidate = result.data as ApiKey | null;
      }
      if (!verifyKey(token, candidate, secret)) throw new ApiError(401, 'unauthorized', 'Invalid credentials');
      key = candidate!;
      if (!Array.isArray(key.scopes) || key.scopes.length !== 1 || key.scopes[0] !== scope) throw new ApiError(403, 'scope_denied', 'Scope denied');
      if (!Number.isSafeInteger(key.id) || key.id <= 0 || !Array.isArray(key.project_ids) || key.project_ids.some(id => !Number.isSafeInteger(id) || id <= 0) || !Number.isSafeInteger(key.rate_read_per_min) || key.rate_read_per_min < 1) throw unavailable();
      await rateHit(db, key);
      const before = new Date(Date.now() - 60000).toISOString();
      const used = await db.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id).or(`last_used_at.is.null,last_used_at.lt.${before}`);
      if (used.error) throw unavailable();
      params = await context?.params ?? {};
      const representation = await handler({ req, params, db, key });
      const url = new URL(req.url);
      const tag = etag({ v: 1, ...representation, selection: { path: url.pathname, query: [...url.searchParams].sort(([a], [b]) => a.localeCompare(b)) } });
      headers.set('ETag', tag);
      // Strong comparison only; wildcard still requires a fully authorized representation.
      const tags = req.headers.get('If-None-Match')?.split(',').map(s => s.trim()) ?? [];
      if (tags.includes(tag) || tags.includes('*')) status = 304;
      else body = { v: 1, rid, ...representation };
    } catch (error) {
      const safe = error instanceof ApiError ? error : unavailable();
      status = safe.status; code = safe.code;
      if (safe.retryAfter) headers.set('Retry-After', String(safe.retryAfter));
      body = { ok: false, rid, error: { code, msg: safe.msg } };
    }
    try {
      if (!db) throw unavailable();
      const id = params.id && /^\d+$/.test(params.id) ? Number(params.id) : undefined;
      await audit(db, req, key, { rid, method: req.method, route: pattern, taskId: pattern.includes('/tasks/{id}') && Number.isSafeInteger(id) && Number(id) > 0 && Number(id) <= 2147483647 ? id : undefined, status, code, duration: performance.now() - started });
    } catch {
      status = 503; headers.delete('ETag'); headers.delete('Retry-After');
      body = { ok: false, rid, error: { code: 'unavailable', msg: 'Service unavailable' } };
      console.error(JSON.stringify({ rid, code: 'audit_unavailable' }));
    }
    return new Response(status === 304 || req.method === 'HEAD' ? null : JSON.stringify(body), { status, headers: { ...Object.fromEntries(headers), ...(status !== 304 ? { 'Content-Type': 'application/json' } : {}) } });
  };
}
