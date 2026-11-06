import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { botRoute } from '@/lib/bot-api/auth';
import { me } from '@/lib/bot-api/read';
import { fixture, mockDb, step } from './helpers/bot-api';

const { admin } = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: admin }));
beforeEach(() => { vi.restoreAllMocks(); });
function setup() {
  const f = fixture(); const m = mockDb([], c => c.table === 'api_keys' && !c.steps.some(s => s.method === 'update') ? { data: f.key } : {});
  admin.mockReturnValue(m.db);
  const headers = { Authorization: `Bearer ${f.token}` };
  return { ...f, ...m, headers, route: botRoute('tasks:read', me, '/api/bot/v1/me') };
}
describe('live Bearer-only route boundary', () => {
  it('returns correlation and cache isolation without credentials or cookies', async () => {
    const s = setup(); const r = await s.route(new Request('http://local/api/bot/v1/me', { headers: s.headers }));
    const body = await r.json(); expect(r.status).toBe(200); expect(body.v).toBe(1);
    expect(body.rid).toBe(r.headers.get('X-Request-Id')); expect(body.data.label).toBe('bot-a');
    expect(r.headers.get('Cache-Control')).toBe('private, no-store'); expect(r.headers.get('Vary')).toBe('Authorization');
    expect(r.headers.has('Set-Cookie')).toBe(false);
    expect(/key_hash|rsb_live_|pepper|created_by|email/.test(JSON.stringify(body))).toBe(false);
  });
  it.each(['malformed','unknown','wrong','revoked','expired','boundary','cookie','view-as'])('returns the identical generic 401 for %s', async kind => {
    const s = setup(); const headers: Record<string,string> = { ...s.headers };
    if (kind === 'malformed') headers.Authorization = 'Bearer malformed';
    if (kind === 'unknown') admin.mockReturnValue(mockDb().db);
    if (kind === 'wrong') s.key.key_hash = '0'.repeat(64);
    if (kind === 'revoked') s.key.revoked_at = new Date().toISOString();
    if (['expired','boundary'].includes(kind)) s.key.expires_at = new Date(Date.now() - (kind === 'expired' ? 1000 : 0)).toISOString();
    if (['cookie','view-as'].includes(kind)) { delete headers.Authorization; headers.Cookie = kind === 'cookie' ? 'session=synthetic' : 'rs-view-as=1'; }
    const r = await s.route(new Request('http://local/api/bot/v1/me', { headers }));
    expect(r.status).toBe(401); const body = await r.json(); expect(body.error).toEqual({ code: 'unauthorized', msg: 'Invalid credentials' });
  });
  it('a session cookie cannot widen valid key grants', async () => {
    const s = setup(); const r = await s.route(new Request('http://local/api/bot/v1/me', { headers: { ...s.headers, Cookie: 'rs-view-as=999; session=synthetic' } }));
    expect((await r.json()).data.project_ids).toEqual([1]);
  });
  it('denies broader or missing scopes', async () => {
    for (const scopes of [[],['tasks:write'],['tasks:read','tasks:write']]) {
      const s = setup(); s.key.scopes = scopes;
      expect((await s.route(new Request('http://local/api/bot/v1/me', { headers: s.headers }))).status).toBe(403);
    }
  });
  it('rejects browser origins and emits no CORS headers', async () => {
    const s = setup(); const r = await s.route(new Request('http://local/api/bot/v1/me', { headers: { ...s.headers, Origin: 'https://example.invalid' } }));
    expect(r.status).toBe(403); expect([...r.headers.keys()].some(k => k.startsWith('access-control-'))).toBe(false);
    expect(s.calls.filter(c => c.table === 'api_audit_log').length).toBe(1);
  });
  it.each(['HEAD','OPTIONS','POST','PATCH','PUT','DELETE'])('audits unsupported %s without business handlers', async method => {
    const s = setup(); const r = await s.route(new Request('http://local/api/bot/v1/me', { method }));
    expect(r.status).toBe(405); expect(r.headers.get('Allow')).toBe('GET');
    if (method === 'HEAD') expect(await r.text()).toBe('');
    expect(s.calls.map(c => c.table)).toEqual(['api_audit_log']);
  });
  it.each(['auth','rate','audit','last-used','config'])('fails closed if %s is unavailable', async failure => {
    const s = setup(); vi.spyOn(console, 'error').mockImplementation(() => {});
    if (failure === 'rate') s.rpc.mockResolvedValue({ error: { message: 'private database detail' } });
    if (failure === 'config') delete process.env.BOT_API_KEY_PEPPER;
    if (['auth','audit','last-used'].includes(failure)) admin.mockReturnValue(mockDb([], c => {
      if ((failure === 'audit' && c.table === 'api_audit_log') || (failure === 'auth' && c.table === 'api_keys') || (failure === 'last-used' && c.steps.some(s => s.method === 'update'))) return { error: { message: 'private database detail' } };
      return c.table === 'api_keys' ? { data: s.key } : {};
    }).db);
    const r = await s.route(new Request('http://local/api/bot/v1/me', { headers: s.headers }));
    expect(r.status).toBe(503); const b = await r.json(); expect(b.error).toEqual({ code: 'unavailable', msg: 'Service unavailable' }); expect(b.data).toBeUndefined();
  });
  it('conditionals still authenticate, rate-limit and audit every request', async () => {
    const s = setup(), req = () => new Request('http://local/api/bot/v1/me', { headers: s.headers });
    const first = await s.route(req()), tag = first.headers.get('ETag')!;
    const second = await s.route(new Request('http://local/api/bot/v1/me', { headers: { ...s.headers, 'If-None-Match': tag } }));
    expect(second.status).toBe(304); expect(await second.text()).toBe(''); expect(second.headers.has('X-Request-Id')).toBe(true);
    expect(s.rpc.mock.calls.length).toBe(2);
    expect(s.calls.filter(c => c.table === 'api_audit_log').length).toBe(2);
    s.key.revoked_at = new Date().toISOString();
    expect((await s.route(new Request('http://local/api/bot/v1/me', { headers: { ...s.headers, 'If-None-Match': tag } }))).status).toBe(401);
  });
  it('304 cannot bypass exhausted limits or unavailable audit storage', async () => {
    const s = setup(); const r = await s.route(new Request('http://local/api/bot/v1/me', { headers: s.headers }));
    s.rpc.mockResolvedValue({ data: 121 });
    const denied = await s.route(new Request('http://local/api/bot/v1/me', { headers: { ...s.headers, 'If-None-Match': r.headers.get('ETag')! } }));
    expect(denied.status).toBe(429); expect(Number(denied.headers.get('Retry-After')) > 0).toBe(true);
  });
  it('required audit outage suppresses a matching conditional response', async () => {
    const s = setup(); const first = await s.route(new Request('http://local/api/bot/v1/me', { headers:s.headers }));
    vi.spyOn(console,'error').mockImplementation(() => {});
    admin.mockReturnValue(mockDb([], c => c.table === 'api_audit_log' ? { error:true } : c.table === 'api_keys' && !c.steps.some(s => s.method === 'update') ? { data:s.key } : {}).db);
    const second = await s.route(new Request('http://local/api/bot/v1/me', { headers:{ ...s.headers, 'If-None-Match':first.headers.get('ETag')! } }));
    expect(second.status).toBe(503); expect(second.headers.has('ETag')).toBe(false); expect((await second.json()).data).toBeUndefined();
  });
  it('changes tags for included children, counts, field/full query and not request ids', async () => {
    const s = setup();
    const value: { links: string[][]; counts: { comments:number } } = { links:[], counts:{ comments:0 } };
    const route = botRoute('tasks:read', async () => ({ data:value, untrusted:['links'] }), '/api/bot/v1/tasks/{id}');
    const request = (tag?: string, query = '') => new Request('http://local/api/bot/v1/tasks/1'+query, { headers:{ ...s.headers, ...(tag ? { 'If-None-Match':tag } : {}) } });
    const first = await route(request()), tag = first.headers.get('ETag')!;
    expect((await route(request(tag))).status).toBe(304);
    value.links.push(['Doc','https://example.invalid']);
    const changed = await route(request(tag)); expect(changed.status).toBe(200); expect(changed.headers.get('ETag')===tag).toBe(false);
    const childTag = changed.headers.get('ETag')!; value.counts.comments++;
    expect((await route(request(childTag))).status).toBe(200);
    const full = await route(request(undefined,'?full=1'));
    expect(full.headers.get('ETag')===(await route(request())).headers.get('ETag')).toBe(false);
  });
  it('uses a conditional database last-used update, with no positive cache', async () => {
    const s = setup(); for (let i = 0; i < 2; i++) await s.route(new Request('http://local/api/bot/v1/me', { headers: s.headers }));
    const updates = s.calls.filter(c => c.steps.some(s => s.method === 'update'));
    expect(updates.length).toBe(2); expect(updates.every(c => step(c,'eq','id',1) && c.steps.some(s => s.method === 'or' && String(s.args[0]).startsWith('last_used_at.is.null,last_used_at.lt.')))).toBe(true);
    expect(s.calls.filter(c => c.table === 'api_keys' && c.steps.some(s => s.method === 'maybeSingle')).length).toBe(2);
  });
  it('never audits unverified submitted prefixes or arbitrary request fields', async () => {
    const s = setup(); s.key.key_hash = '0'.repeat(64);
    await s.route(new Request('http://local/api/bot/v1/me?q=private', { headers: { ...s.headers, 'x-forwarded-for': '1.2.3.4' } }));
    const entry = s.calls.find(c => c.table === 'api_audit_log')!.steps[0].args[0] as Record<string, unknown>;
    expect(entry.key_id).toBeNull(); expect(entry.key_prefix).toBeNull(); expect(entry.bot_label).toBeNull(); expect(entry.ip).toBeNull();
    expect(entry.route).toBe('/api/bot/v1/me'); expect(/private|rsb_live_|key_hash/.test(JSON.stringify(entry))).toBe(false);
  });
  it('existing session routes keep their session boundary', () => {
    const source = readFileSync('src/app/api/tickets/work-items/route.ts','utf8');
    expect(source.includes('requireSession')).toBe(true); expect(source.includes('bot-api')).toBe(false);
  });
});
