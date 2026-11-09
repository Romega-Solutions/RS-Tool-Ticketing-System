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
    expect(migration.includes("TG_OP = 'UPDATE'")).toBe(true);
    expect(migration.includes('NEW.expires_at > OLD.expires_at')).toBe(true);
    expect(migration.includes('NEW.key_hash IS DISTINCT FROM OLD.key_hash')).toBe(true);
    expect(migration.includes('NEW.key_prefix IS DISTINCT FROM OLD.key_prefix')).toBe(true);
    expect(migration.includes('NEW.rotated_from_id IS DISTINCT FROM OLD.rotated_from_id')).toBe(true);
    expect(migration.includes('OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL')).toBe(true);
    expect(migration.includes('security_invoker = true')).toBe(true);
    expect(migration.includes('FOR UPDATE')).toBe(true);
    expect(migration.includes("NEW.expires_at := now() + interval '90 days'")).toBe(true);
    expect(migration.includes('FROM PUBLIC, anon, authenticated')).toBe(true);
    for (const name of ['api_keys','api_audit_log','api_rate_counters']) expect(migration.includes(`ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY`)).toBe(true);
    expect(/api_idempotency|ALTER TABLE public\.work_items|CREATE POLICY/i.test(migration)).toBe(false);
    expect(rollback.includes('WARNING') && !/DROP TABLE.*(users|work_items)/.test(rollback)).toBe(true);
  });
  it('declares the three corresponding schema tables with matching lifecycle fields', () => {
    expect([apiKeys,apiAuditLog,apiRateCounters].map(t => getTableConfig(t).name)).toEqual(['api_keys','api_audit_log','api_rate_counters']);
    expect([apiKeys,apiAuditLog,apiRateCounters].every(t => getTableConfig(t).enableRLS)).toBe(true);
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
  let prepared = false; let stage = 'destination';
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
    CREATE TABLE public.work_items (id integer PRIMARY KEY, updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE public.work_item_comments (id integer PRIMARY KEY, updated_at text NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE public.work_item_activity (id integer PRIMARY KEY, created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP);
    GRANT SELECT ON public.work_items, public.work_item_comments, public.work_item_activity TO service_role;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;`);
    prepared = true;
    stage = 'apply'; await ddl.unsafe(migration); stage = 'reapply'; await ddl.unsafe(migration); stage = 'acl';
    const role = <T>(name: 'anon' | 'authenticated' | 'service_role', action: (tx: TransactionSql) => Promise<T>) => sql.begin(async tx => { await tx.unsafe(`SET LOCAL ROLE ${name}`); return action(tx); });
    for (const name of ['anon','authenticated'] as const) {
      for (const table of ['api_keys','api_audit_log','api_rate_counters','bot_api_work_items','bot_api_work_item_comments','bot_api_work_item_activity']) await expect(role(name, async tx => tx.unsafe(`SELECT * FROM public.${table}`))).rejects.toBeDefined();
      await expect(role(name, async tx => tx`SELECT public.api_rate_hit(1,'read:minute',now())`)).rejects.toBeDefined();
      for (const sequence of ['api_keys_id_seq','api_audit_log_id_seq']) await expect(role(name, async tx => tx.unsafe(`SELECT nextval('public.${sequence}')`))).rejects.toBeDefined();
      expect((await sql`SELECT has_function_privilege(${name},'public.api_key_lifecycle_trigger()','EXECUTE') AS allowed`)[0].allowed).toBe(false);
      for (const table of ['api_keys','api_audit_log','api_rate_counters']) {
        for (const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) {
          expect((await sql`SELECT has_table_privilege(${name},${'public.'+table},${privilege}) AS allowed`)[0].allowed).toBe(false);
        }
      }
      for (const sequence of ['api_keys_id_seq','api_audit_log_id_seq']) {
        for (const privilege of ['USAGE','SELECT','UPDATE']) expect((await sql`SELECT has_sequence_privilege(${name},${'public.'+sequence},${privilege}) AS allowed`)[0].allowed).toBe(false);
      }
    }
    const security = await sql`SELECT relname, relrowsecurity FROM pg_class WHERE oid IN ('public.api_keys'::regclass,'public.api_audit_log'::regclass,'public.api_rate_counters'::regclass)`;
    expect(security.every(r => r.relrowsecurity)).toBe(true);
    expect((await sql`SELECT has_function_privilege('service_role','public.api_key_lifecycle_trigger()','EXECUTE') AS allowed`)[0].allowed).toBe(false);
    for (const table of ['api_keys','api_audit_log','api_rate_counters','bot_api_work_items','bot_api_work_item_comments','bot_api_work_item_activity']) await role('service_role', tx => tx.unsafe(`SELECT * FROM public.${table}`));
    for (const sequence of ['api_keys_id_seq','api_audit_log_id_seq']) await role('service_role', tx => tx.unsafe(`SELECT nextval('public.${sequence}')`));
    for (const [table,column] of [['work_items','updated_at'],['work_item_comments','updated_at'],['work_item_activity','created_at']]) {
      const malformed = await sql.unsafe(`SELECT id FROM public.${table} WHERE NOT (${column} ~ '^\\d{4}-\\d\\d-\\d\\d[ T]')`);
      expect(malformed.length).toBe(0);
      expect((await sql.unsafe(`SELECT ${column}::timestamptz FROM public.${table}`)).length).toBe(0);
    }
    stage = 'issuance'; const f = fixture();
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
    stage = 'concurrency'; const window = new Date(Math.floor(Date.now()/60000)*60000);
    await Promise.all(Array.from({length:100}, () => role('service_role', async tx => tx`SELECT public.api_rate_hit(${id},'read:minute',${window})`)));
    const count = await sql`SELECT count FROM public.api_rate_counters WHERE key_id=${id}`; expect(count[0].count).toBe(100);
    stage = 'rotation'; const replacement = generateKey();
    await role('service_role', async tx => tx`INSERT INTO public.api_keys(label,key_prefix,key_hash,scopes,project_ids,rotated_from_id) VALUES ('bot-a',${replacement.prefix},${hashKey(replacement.token)},ARRAY['tasks:read'],ARRAY[999],${id})`);
    const rows = await sql`SELECT id, project_ids, scopes, expires_at,rotated_from_id FROM public.api_keys ORDER BY id`;
    expect(rows[1].project_ids).toEqual([1]); expect(rows[1].scopes).toEqual(['tasks:read']); expect(Number(rows[1].rotated_from_id)).toBe(id);
    expect(new Date(rows[0].expires_at).getTime() <= Date.now()+86400000).toBe(true);
    stage = 'short-expiry'; await sql`UPDATE public.api_keys SET expires_at=now()+interval '30 minutes' WHERE id=${id}`;
    const before = await sql`SELECT expires_at FROM public.api_keys WHERE id=${id}`;
    const next = generateKey();
    await expect(role('service_role', async tx => tx`INSERT INTO public.api_keys(label,key_prefix,key_hash,project_ids,rotated_from_id) VALUES ('bot-a',${next.prefix},${hashKey(next.token)},ARRAY[1],${id})`)).rejects.toBeDefined();
    await role('service_role', async tx => tx`UPDATE public.api_keys SET revoked_at=now() WHERE rotated_from_id=${id}`);
    await role('service_role', async tx => tx`INSERT INTO public.api_keys(label,key_prefix,key_hash,project_ids,rotated_from_id) VALUES ('bot-a',${next.prefix},${hashKey(next.token)},ARRAY[1],${id})`);
    const after = await sql`SELECT expires_at FROM public.api_keys WHERE id=${id}`; expect(String(after[0].expires_at)).toBe(String(before[0].expires_at));
    const latest = (await sql`SELECT id,expires_at FROM public.api_keys WHERE key_prefix=${next.prefix}`)[0];
    stage = 'failed-replacement'; const newId = Number(latest.id), oldExpiry = latest.expires_at;
    await expect(role('service_role', async tx => tx`INSERT INTO public.api_keys(label,key_prefix,key_hash,project_ids,rotated_from_id) VALUES ('bot-a',${f.key.key_prefix},${f.key.key_hash},ARRAY[1],${newId})`)).rejects.toBeDefined();
    const unchanged = await sql`SELECT expires_at FROM public.api_keys WHERE id=${newId}`; expect(String(unchanged[0].expires_at)).toBe(String(oldExpiry));
    await role('service_role', async tx => tx`UPDATE public.api_keys SET revoked_at=now() WHERE id=${id}`);
    const blocked = generateKey();
    await expect(role('service_role', async tx => tx`INSERT INTO public.api_keys(label,key_prefix,key_hash,project_ids,rotated_from_id) VALUES ('bot-a',${blocked.prefix},${hashKey(blocked.token)},ARRAY[1],${id})`)).rejects.toBeDefined();
    stage = 'update-guards'; for (const change of ["expires_at=now()+interval '100 days'", "revoked_at=NULL", "key_hash=repeat('a',64)", "key_prefix='changed1'", 'rotated_from_id=1']) {
      await expect(role('service_role', tx => tx.unsafe(`UPDATE public.api_keys SET ${change} WHERE id=${id}`))).rejects.toBeDefined();
    }
    stage = 'parallel-rotation';
    const parent = generateKey();
    const parentRow = (await role('service_role', tx => tx`INSERT INTO public.api_keys(label,key_prefix,key_hash,project_ids) VALUES ('bot-a',${parent.prefix},${hashKey(parent.token)},ARRAY[1]) RETURNING id`))[0];
    const attempts = await Promise.allSettled(Array.from({length:2}, async () => {
      const replacement = generateKey();
      return role('service_role', tx => tx`INSERT INTO public.api_keys(label,key_prefix,key_hash,project_ids,rotated_from_id) VALUES ('bot-a',${replacement.prefix},${hashKey(replacement.token)},ARRAY[1],${parentRow.id})`);
    }));
    expect(attempts.filter(r => r.status === 'fulfilled').length).toBe(1);
    expect(attempts.filter(r => r.status === 'rejected').length).toBe(1);
    stage = 'foreign-key-drift';
    await ddl.unsafe('ALTER TABLE public.api_keys DROP CONSTRAINT api_keys_rotated_from_id_fkey');
    await expect(ddl.unsafe(migration)).rejects.toMatchObject({code:'P0001'});
    await ddl.unsafe('ROLLBACK');
    await ddl.unsafe('ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_rotated_from_id_fkey FOREIGN KEY (rotated_from_id) REFERENCES public.api_keys(id) ON DELETE SET NULL');
    stage = 'rollback'; await ddl.unsafe(rollback); stage = 'reapply-after-rollback'; await ddl.unsafe(migration);
    const empty = await sql`SELECT count(*)::integer AS n FROM public.api_keys`; expect(empty[0].n).toBe(0);
  } catch (error) {
    // Do not let driver errors serialize connection credentials or key material.
    const code = (error as {code?:unknown}).code;
    throw new Error(`Disposable local migration validation failed at ${stage}; code=${typeof code === 'string' && /^[A-Z0-9]{5}$/.test(code) ? code : 'assertion'}`);
  } finally {
    if (prepared) { await ddl.unsafe('ROLLBACK').catch(() => {}); await ddl.unsafe(rollback).catch(() => {}); await ddl.unsafe('DROP TABLE IF EXISTS public.work_item_activity,public.work_item_comments,public.work_items,public.users').catch(() => {}); }
    await ddl.end(); await sql.end();
  }
}, 60000);
