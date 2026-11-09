import { describe, expect, it, vi } from 'vitest';
import { botRoute } from '@/lib/bot-api/auth';
import { me } from '@/lib/bot-api/read';
const { admin } = vi.hoisted(() => ({admin:vi.fn()}));
vi.mock('@/lib/supabase/admin', () => ({createAdminClient:admin}));
import { rateHit } from '@/lib/bot-api/rate-limit';
import { fixture, mockDb } from './helpers/bot-api';

describe('atomic private read budget', () => {
  it('allows 120 reads, rejects 121, and counts separately per key', async () => {
    const { key } = fixture(), { db, rpc } = mockDb(); const counts = new Map<number, number>();
    rpc.mockImplementation(async (_name, args) => { const n = (counts.get(args.p_key) ?? 0) + 1; counts.set(args.p_key, n); return { data: n }; });
    for (let i = 0; i < 120; i++) await rateHit(db, key, 37000);
    await expect(rateHit(db, key, 37000)).rejects.toMatchObject({ status: 429, retryAfter: 23 });
    await expect(rateHit(db, { ...key, id: 2 }, 37000)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenLastCalledWith('api_rate_hit', { p_key: 2, p_bucket: 'read:minute', p_window: '1970-01-01T00:00:00.000Z' });
  });
  it.each([[59999,1,'1970-01-01T00:00:00.000Z'],[60000,60,'1970-01-01T00:01:00.000Z']])('uses fixed minute windows at %s', async (now, retry, window) => {
    const { key } = fixture(), { db, rpc } = mockDb(); rpc.mockResolvedValue({ data: 121 });
    await expect(rateHit(db, key, Number(now))).rejects.toMatchObject({ retryAfter: retry });
    expect(rpc.mock.calls[0][1].p_window).toBe(window);
  });
  it('charges each 304 against the minute budget before rejecting the next conditional', async () => {
    const f = fixture(), m = mockDb([], c => c.table === 'api_keys' && !c.steps.some(s => s.method === 'update') ? {data:f.key} : {});
    admin.mockReturnValue(m.db); let count = 0;
    m.rpc.mockImplementation(async () => ({data:++count})); f.key.rate_read_per_min = 2;
    const route = botRoute('tasks:read',me,'/api/bot/v1/me');
    const request = (tag?:string) => new Request('http://local/api/bot/v1/me',{headers:{Authorization:`Bearer ${f.token}`,...(tag?{'If-None-Match':tag}:{})}});
    const first = await route(request()); expect(first.status).toBe(200);
    expect((await route(request(first.headers.get('ETag')!))).status).toBe(304);
    const denied = await route(request(first.headers.get('ETag')!)); expect(denied.status).toBe(429);
    expect(Number(denied.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    expect(count).toBe(3);
  });
  it.each([{ error: true }, { data: null }, { data: 0 }, { data: '1' }])('fails closed on storage or protocol failure', async response => {
    const { key } = fixture(), { db, rpc } = mockDb(); rpc.mockResolvedValue(response);
    await expect(rateHit(db, key)).rejects.toMatchObject({ status: 503 });
  });
});
