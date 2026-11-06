import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { TransactionSql } from 'postgres';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { apiKeys, apiAuditLog, apiRateCounters } from '@/db/schema';
import { fixture } from './helpers/bot-api';
import { generateKey, hashKey } from '@/lib/bot-api/keys';

const migration = readFileSync('drizzle/0021_bot_api_keys.sql','utf8');
const rollback = readFileSync('docs/migrations/0021-bot-api-keys-rollback.sql','utf8');
export function assertDisposableLocal(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Disposable local database required'); }
  if (!['postgres:','postgresql:'].includes(url.protocol) || !['localhost','127.0.0.1','[::1]'].includes(url.hostname) ||
    !/^\/[a-z0-9_]+_bot_api_disposable$/.test(url.pathname) || url.search || url.hash) throw new Error('Disposable local database required');
  // Avoid DNS/config redirection, query-string host overrides and fallback remote defaults.
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  return url.toString();
}
describe('migration safety and schema inventory', () => {
  it.each(['postgres://remote.invalid/db_bot_api_disposable','postgres://127.0.0.1/production','postgres://127.0.0.1/a_bot_api_disposable?host=remote.invalid','bad','postgres://127.0.0.1/a_bot_api_disposable#test'])('rejects non-disposable destination %s', value => { expect(() => assertDisposableLocal(value)).toThrow(); });
  it('accepts only explicit loopback disposable databases', () => { expect(assertDisposableLocal('postgres://localhost/test_bot_api_disposable').includes('127.0.0.1')).toBe(true); });
  it('is transactional, read-scoped, role-restricted and includes atomic lifecycle enforcement', () => {
    expect(migration.trim().startsWith('--')).toBe(true); expect(migration.includes('BEGIN;') && migration.trim().endsWith('COMMIT;')).toBe(true);
    expect(migration.includes('SECURITY DEFINER')).toBe(false);
    expect(migration.includes('SECURITY INVOKER')).toBe(true);
    expect(migration.includes('ON CONFLICT (key_id, bucket, window_start)')).toBe(true);
    expect(migration.includes("LEAST(expires_at, now() + interval '24 hours')")).toBe(true);
    expect(migration.includes('FOR UPDATE')).toBe(true);
    expect(migration.includes("NEW.expires_at := now() + interval '90 days'")).toBe(true);
    expect(migration.includes('FROM PUBLIC, anon, authenticated')).toBe(true);
    for (const name of ['api_keys','api_audit_log','api_rate_counters']) expect(migration.includes(`ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY`)).toBe(true);
    expect(/api_idempotency|ALTER TABLE public\.work_items|CREATE POLICY/i.test(migration)).toBe(false);
    expect(rollback.includes('WARNING') && !/DROP TABLE.*(users|work_items)/.test(rollback)).toBe(true);
  });
  it('declares the three corresponding schema tables with matching lifecycle fields', () => {
    expect([apiKeys,apiAuditLog,apiRateCounters].map(t => getTableConfig(t).name)).toEqual(['api_keys','api_audit_log','api_rate_counters']);
    expect(getTableConfig(apiKeys).columns.find(c => c.name === 'expires_at')?.notNull).toBe(true);
    expect(getTableConfig(apiRateCounters).primaryKeys.length).toBe(1);
    expect(getTableConfig(apiAuditLog).indexes.length).toBe(2);
  });
});

// No URL is read from application env, dotenv, Supabase or a remote default.
const local = process.env.BOT_API_LOCAL_TEST_DATABASE_URL;
it.skipIf(!local)('disposable localhost apply/reapply/rollback, roles, rotation and concurrent counters', async () => {
  const destination = assertDisposableLocal(local!);
  const { default: postgres } = await import('postgres');
  const sql = postgres(destination, { max: 12, onnotice: () => {} });
  const ddl = postgres(destination, { max: 1, onnotice: () => {} });
  let prepared = false;
  try {
    const server = await sql`SELECT inet_server_addr()::text AS address, current_database() AS db`;
    expect(['127.0.0.1/32','127.0.0.1','::1/128','::1',null].includes(server[0].address)).toBe(true);
    expect(String(server[0].db).endsWith('_bot_api_disposable')).toBe(true);
    const existing = await sql`SELECT tablename FROM pg_tables WHERE schemaname='public'`;
    if (existing.length) throw new Error('Use a new empty disposable database');
    await sql.unsafe(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
    END $$; CREATE TABLE public.users (id integer PRIMARY KEY);
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;`);
    prepared = true;
    await ddl.unsafe(migration); await ddl.unsafe(migration);
    const role = <T>(name: 'anon' | 'authenticated' | 'service_role', action: (tx: TransactionSql) => Promise<T>) => sql.begin(async tx => { await tx.unsafe(`SET LOCAL ROLE ${name}`); return action(tx); });
    for (const name of ['anon','authenticated'] as const) {
      for (const table of ['api_keys','api_audit_log','api_rate_counters']) await expect(role(name, async tx => tx.unsafe(`SELECT * FROM public.${table}`))).rejects.toBeDefined();
      await expect(role(name, async tx => tx`SELECT public.api_rate_hit(1,'read:minute',now())`)).rejects.toBeDefined();
      await expect(role(name, async tx => tx`SELECT nextval('public.api_keys_id_seq')`)).rejects.toBeDefined();
    }
    const security = await sql`SELECT relname, relrowsecurity FROM pg_class WHERE oid IN ('public.api_keys'::regclass,'public.api_audit_log'::regclass,'public.api_rate_counters'::regclass)`;
    expect(security.every(r => r.relrowsecurity)).toBe(true);
    const f = fixture();
    const issued = await role('service_role', async tx => tx`INSERT INTO public.api_keys(label,key_prefix,key_hash,project_ids,expires_at) VALUES ('bot-a',${f.key.key_prefix},${f.key.key_hash},ARRAY[1],now()+interval '1000 days') RETURNING id,expires_at,created_at`);
    const first = issued[0], id = Number(first.id);
    expect(Math.abs((new Date(first.expires_at).getTime()-new Date(first.created_at).getTime())/86400000-90)).toBeLessThan(0.001);
    await expect(sql`INSERT INTO public.api_keys(label,key_prefix,key_hash,project_ids,scopes) VALUES ('bot-a','invalid1',${f.key.key_hash},ARRAY[1],ARRAY['tasks:write'])`).rejects.toBeDefined();
    await expect(sql`INSERT INTO public.api_keys(label,key_prefix,key_hash,project_ids) VALUES ('bot-a','invalid2',${f.key.key_hash},ARRAY[0])`).rejects.toBeDefined();
    for (const table of [apiKeys,apiAuditLog,apiRateCounters]) {
      const config = getTableConfig(table);
      const actual = await sql`SELECT column_name,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name=${config.name} ORDER BY ordinal_position`;
      expect(actual.map(c => c.column_name)).toEqual(config.columns.map(c => c.name));
      expect(actual.map(c => c.is_nullable === 'NO')).toEqual(config.columns.map(c => c.notNull));
    }
    const window = new Date(Math.floor(Date.now()/60000)*60000);
    await Promise.all(Array.from({length:100}, () => role('service_role', async tx => tx`SELECT public.api_rate_hit(${id},'read:minute',${window})`)));
    const count = await sql`SELECT count FROM public.api_rate_counters WHERE key_id=${id}`; expect(count[0].count).toBe(100);
    const replacement = generateKey();
    await role('service_role', async tx => tx`INSERT INTO public.api_keys(label,key_prefix,key_hash,scopes,project_ids,rotated_from_id) VALUES ('bot-a',${replacement.prefix},${hashKey(replacement.token)},ARRAY['tasks:read'],ARRAY[999],${id})`);
    const rows = await sql`SELECT id, project_ids, scopes, expires_at,rotated_from_id FROM public.api_keys ORDER BY id`;
    expect(rows[1].project_ids).toEqual([1]); expect(rows[1].scopes).toEqual(['tasks:read']); expect(Number(rows[1].rotated_from_id)).toBe(id);
    expect(new Date(rows[0].expires_at).getTime() <= Date.now()+86400000).toBe(true);
    await sql`UPDATE public.api_keys SET expires_at=now()+interval '30 minutes' WHERE id=${id}`;
    const before = await sql`SELECT expires_at FROM public.api_keys WHERE id=${id}`;
    const next = generateKey();
    await role('service_role', async tx => tx`INSERT INTO public.api_keys(label,key_prefix,key_hash,project_ids,rotated_from_id) VALUES ('bot-a',${next.prefix},${hashKey(next.token)},ARRAY[1],${id})`);
    const after = await sql`SELECT expires_at FROM public.api_keys WHERE id=${id}`; expect(String(after[0].expires_at)).toBe(String(before[0].expires_at));
    const newId = Number(rows[1].id), oldExpiry = rows[1].expires_at;
    await expect(role('service_role', async tx => tx`INSERT INTO public.api_keys(label,key_prefix,key_hash,project_ids,rotated_from_id) VALUES ('bot-a',${f.key.key_prefix},${f.key.key_hash},ARRAY[1],${newId})`)).rejects.toBeDefined();
    const unchanged = await sql`SELECT expires_at FROM public.api_keys WHERE id=${newId}`; expect(String(unchanged[0].expires_at)).toBe(String(oldExpiry));
    await role('service_role', async tx => tx`UPDATE public.api_keys SET revoked_at=now() WHERE id=${id}`);
    const blocked = generateKey();
    await expect(role('service_role', async tx => tx`INSERT INTO public.api_keys(label,key_prefix,key_hash,project_ids,rotated_from_id) VALUES ('bot-a',${blocked.prefix},${hashKey(blocked.token)},ARRAY[1],${id})`)).rejects.toBeDefined();
    await ddl.unsafe(rollback); await ddl.unsafe(migration);
    const empty = await sql`SELECT count(*)::integer AS n FROM public.api_keys`; expect(empty[0].n).toBe(0);
  } catch {
    // Do not let driver errors serialize connection credentials or key material.
    throw new Error('Disposable local migration validation failed; inspect schema and ACLs privately');
  } finally {
    if (prepared) { await ddl.unsafe('ROLLBACK').catch(() => {}); await ddl.unsafe(rollback).catch(() => {}); await ddl.unsafe('DROP TABLE IF EXISTS public.users').catch(() => {}); }
    await ddl.end(); await sql.end();
  }
}, 60000);
