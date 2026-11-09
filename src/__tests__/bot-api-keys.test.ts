import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKey, hashKey, parseKey, pepper, verifyKey } from '@/lib/bot-api/keys';
import { fixture, mockDb, step } from './helpers/bot-api';
import { runKeyCli } from '../../scripts/create-bot-key';

beforeEach(() => { fixture(); });
describe('read credential primitives', () => {
  it('generates canonical random credentials without reuse', () => {
    const tokens = Array.from({ length: 100 }, () => generateKey().token);
    expect(tokens.every(t => !!parseKey(t) && Buffer.from(t.slice(-43), 'base64url').length === 32)).toBe(true);
    expect(new Set(tokens).size).toBe(100);
  });
  it.each(['', 'Bearer value', 'rsb_live_bad', ' rsb_live_bad', 'not-a-key'])('rejects malformed shape %s', raw => { expect(parseKey(raw) === null).toBe(true); });
  it('hashes the full credential with a pepper and verifies a known digest', () => {
    const { key, token } = fixture();
    expect(verifyKey(token, key)).toBe(true);
    expect(hashKey(token) !== token && hashKey(token).length === 64).toBe(true);
    expect(verifyKey(generateKey().token, key)).toBe(false);
    expect(verifyKey(token, null)).toBe(false);
    expect(verifyKey(token, { ...key, key_hash: 'invalid' })).toBe(false);
    expect(verifyKey(token, key, 'different synthetic pepper')).toBe(false);
  });
  it.each(['revoked','expired','boundary','invalid expiry'])('rejects lifecycle %s', kind => {
    const { key, token } = fixture(), now = Date.now();
    if (kind === 'revoked') key.revoked_at = new Date(now).toISOString();
    else key.expires_at = kind === 'invalid expiry' ? 'invalid' : new Date(now - (kind === 'expired' ? 1 : 0)).toISOString();
    expect(verifyKey(token, key, pepper(), now)).toBe(false);
  });
  it('fails closed with missing configuration', () => { delete process.env.BOT_API_KEY_PEPPER; expect(() => pepper()).toThrow('configuration_unavailable'); });
});
describe('maintainer lifecycle command', () => {
  it('prints once only after confirmed insert; persists digest rather than credential', async () => {
    const { db, calls } = mockDb([{ data: { id: 1 } }]); const output: boolean[] = [];
    await runKeyCli(['issue','--label','bot-a','--projects','1,2'], line => output.push(!!parseKey(line)), () => db);
    expect(output).toEqual([true]);
    const insert = calls[0].steps.find(s => s.method === 'insert')!.args[0] as Record<string, unknown>;
    expect(Object.keys(insert).sort()).toEqual(['created_by','key_hash','key_prefix','label','project_ids','rotated_from_id','scopes']);
    expect(typeof insert.key_hash === 'string' && /^[a-f0-9]{64}$/.test(insert.key_hash)).toBe(true);
    expect(insert.scopes).toEqual(['tasks:read']);
  });
  it.each([[],['--projects',''],['--projects','0'],['--projects','-1'],['--projects','1,'],['--projects','1','--scopes','tasks:write']].map(flags => ({ flags })))('refuses invalid or empty grants', async ({ flags }) => {
    const factory = vi.fn(); await expect(runKeyCli(['issue','--label','bot-a',...flags], () => {}, factory)).rejects.toThrow(); expect(factory).not.toHaveBeenCalled();
  });
  it('does not print when storage fails', async () => {
    const { db } = mockDb([{ error: { message: 'private' } }]); let count = 0;
    await expect(runKeyCli(['issue','--label','bot-a','--projects','1'], () => count++, () => db)).rejects.toThrow('Operation failed'); expect(count).toBe(0);
  });
  it('lists only public metadata, not digests', async () => {
    const { db, calls } = mockDb([{ data: [] }]); await runKeyCli(['list'], () => {}, () => db);
    const columns = calls[0].steps.find(s => s.method === 'select')!.args[0] as string;
    expect(/key_hash|secret|pepper/.test(columns)).toBe(false);
    expect(step(calls[0], 'limit', 100)).toBe(true);
  });
  it('rotates using one atomic insert linked to the predecessor', async () => {
    const { key } = fixture(); const { db, calls } = mockDb([{ data: key },{ data: { id: 2 } }]); let count = 0;
    await runKeyCli(['rotate','--id','1'], () => count++, () => db);
    expect(count).toBe(1); expect(calls.length).toBe(2);
    const insert = calls[1].steps.find(s => s.method === 'insert')!.args[0] as Record<string, unknown>;
    expect(insert.rotated_from_id).toBe(1); expect(insert.scopes).toEqual(['tasks:read']);
    expect(insert.project_ids).toEqual([1]); expect('expires_at' in insert).toBe(false);
  });
  it('failed replacement emits nothing and never separately changes the predecessor', async () => {
    const { key } = fixture(); const { db, calls } = mockDb([{ data: key }, { error: true }]); let count = 0;
    await expect(runKeyCli(['rotate','--id','1'], () => count++, () => db)).rejects.toThrow();
    expect(count).toBe(0); expect(calls.some(c => c.steps.some(s => s.method === 'update'))).toBe(false);
  });
  it('revokes immediately and preserves the row', async () => {
    const { key } = fixture(); const { db, calls } = mockDb([{ data: key },{}]);
    await runKeyCli(['revoke','--prefix',key.key_prefix], () => {}, () => db);
    expect(step(calls[1], 'eq', 'id', 1)).toBe(true);
    const value = calls[1].steps.find(s => s.method === 'update')!.args[0] as Record<string, unknown>;
    expect(Number.isFinite(Date.parse(String(value.revoked_at)))).toBe(true);
    expect(calls.some(c => c.steps.some(s => s.method === 'delete'))).toBe(false);
  });
  it('cleans only private audit and rate tables on explicit command', async () => {
    const { db, calls } = mockDb(); await runKeyCli(['cleanup'], () => {}, () => db);
    expect(calls.map(c => c.table)).toEqual(['api_rate_counters','api_audit_log']);
    expect(calls.every(c => c.steps.some(s => s.method === 'delete') && c.steps.some(s => s.method === 'lt'))).toBe(true);
  });
});
