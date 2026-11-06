import { describe, expect, it } from 'vitest';
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
  it.each([{ error: true }, { data: null }, { data: 0 }, { data: '1' }])('fails closed on storage or protocol failure', async response => {
    const { key } = fixture(), { db, rpc } = mockDb(); rpc.mockResolvedValue(response);
    await expect(rateHit(db, key)).rejects.toMatchObject({ status: 503 });
  });
});
