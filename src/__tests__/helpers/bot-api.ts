import { vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateKey, hashKey, type ApiKey } from '@/lib/bot-api/keys';

export type DbResult = { data?: unknown; error?: unknown; count?: number | null };
export type Call = { table: string; steps: { method: string; args: unknown[] }[] };
export function fixture() {
  process.env.BOT_API_KEY_PEPPER = randomBytes(32).toString('base64url');
  const generated = generateKey();
  const key: ApiKey = { id: 1, label: 'bot-a', key_prefix: generated.prefix, key_hash: hashKey(generated.token),
    scopes: ['tasks:read'], project_ids: [1], rate_read_per_min: 120, expires_at: new Date(Date.now() + 86400000).toISOString(), revoked_at: null, last_used_at: null };
  return { token: generated.token, key };
}
export function mockDb(results: DbResult[] = [], resolve?: (call: Call) => DbResult) {
  const calls: Call[] = [];
  const from = vi.fn((table: string) => {
    const call: Call = { table, steps: [] }; calls.push(call);
    const response = results.shift();
    const query: Record<string, unknown> = {};
    for (const method of ['select','insert','update','delete','eq','in','is','lt','gt','or','ilike','filter','order','limit','maybeSingle','single','returns']) {
      query[method] = (...args: unknown[]) => { call.steps.push({ method, args }); return query; };
    }
    query.then = (yes: (r: DbResult) => unknown, no: (e: unknown) => unknown) => Promise.resolve(resolve ? resolve(call) : response ?? { data: null, error: null }).then(yes, no);
    return query;
  });
  const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
  return { db: { from, rpc } as unknown as SupabaseClient, calls, from, rpc };
}
export const step = (call: Call, method: string, ...args: unknown[]) => call.steps.some(s => s.method === method && JSON.stringify(s.args) === JSON.stringify(args));
