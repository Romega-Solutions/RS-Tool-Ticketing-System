import 'dotenv/config';
import { createAdminClient } from '../src/lib/supabase/admin';
import { generateKey, hashKey, pepper } from '../src/lib/bot-api/keys';
import type { SupabaseClient } from '@supabase/supabase-js';

const publicColumns = 'id,label,key_prefix,scopes,project_ids,rate_read_per_min,created_at,last_used_at,expires_at,revoked_at,rotated_from_id';
const validId = (v: string | undefined) => !!v && /^[1-9]\d*$/.test(v) && Number.isSafeInteger(Number(v)) && Number(v) <= 2147483647;
function options(args: string[]) {
  const values: Record<string, string> = {};
  if (args.some(value => value.includes('rsb_live_'))) throw new Error('Credentials are not accepted as arguments');
  if (args.length % 2) throw new Error('Invalid arguments');
  for (let i = 0; i < args.length; i += 2) {
    if (!/^--[a-z]+$/.test(args[i]) || values[args[i].slice(2)] !== undefined || args[i + 1].startsWith('--') || args[i + 1].startsWith('rsb_live_')) throw new Error('Invalid arguments');
    values[args[i].slice(2)] = args[i + 1];
  }
  return values;
}
export async function runKeyCli(args: string[], output: (line: string) => void, dbFactory: () => SupabaseClient = createAdminClient) {
  const [command, ...rest] = args;
  const o = options(rest);
  const allowed: Record<string, string[]> = { issue: ['label','projects','actor'], list: ['id','prefix'], revoke: ['id','prefix','actor','reason'], rotate: ['id','prefix','actor'], cleanup: [] };
  if (!allowed[command] || Object.keys(o).some(k => !allowed[command].includes(k))) throw new Error('Invalid arguments');
  if (o.actor !== undefined && !validId(o.actor)) throw new Error('Invalid operator');
  if (o.id !== undefined && (!/^[1-9]\d*$/.test(o.id) || !Number.isSafeInteger(Number(o.id)))) throw new Error('Invalid id');
  if (o.prefix !== undefined && !/^[A-Za-z0-9_-]{8}$/.test(o.prefix)) throw new Error('Invalid prefix');
  if (o.id && o.prefix) throw new Error('Use id or prefix');
  if (['rotate','revoke'].includes(command) && !o.id && !o.prefix) throw new Error('Missing target');
  const projects = o.projects?.split(',');
  if (command === 'issue' && (!o.label || o.label.length > 200 || !projects?.length || projects.some(v => !validId(v)))) throw new Error('Label and positive project ids required');
  if (o.reason && o.reason.length > 200) throw new Error('Reason too long');
  const db = dbFactory();
  if (command === 'cleanup') {
    const now = Date.now();
    const rates = await db.from('api_rate_counters').delete().lt('window_start', new Date(now - 2 * 86400000).toISOString());
    if (rates.error) throw new Error('Operation failed');
    const audit = await db.from('api_audit_log').delete().lt('created_at', new Date(now - 90 * 86400000).toISOString());
    if (audit.error) throw new Error('Operation failed');
    output('Cleanup complete'); return;
  }
  if (command === 'list') {
    let query = db.from('api_keys').select(publicColumns).order('id').limit(100);
    if (o.id) query = query.eq('id', Number(o.id));
    if (o.prefix) query = query.eq('key_prefix', o.prefix);
    const r = await query;
    if (r.error) throw new Error('Operation failed');
    output(JSON.stringify(r.data)); return;
  }
  let predecessor: Record<string, unknown> | null = null;
  if (command === 'rotate' || command === 'revoke') {
    const r = await db.from('api_keys').select(publicColumns).eq(o.id ? 'id' : 'key_prefix', o.id ? Number(o.id) : o.prefix).maybeSingle();
    if (r.error || !r.data) throw new Error('Target unavailable');
    predecessor = r.data;
  }
  if (command === 'revoke') {
    const r = await db.from('api_keys').update({ revoked_at: new Date().toISOString(), revoked_by: o.actor ? Number(o.actor) : null, revoke_reason: o.reason ?? 'maintainer revoked' }).eq('id', predecessor!.id).is('revoked_at', null);
    if (r.error) throw new Error('Operation failed');
    output('Revoked'); return;
  }
  pepper();
  if (predecessor && (predecessor.revoked_at || Date.parse(String(predecessor.expires_at)) <= Date.now())) throw new Error('Target unavailable');
  const generated = generateKey();
  const r = await db.from('api_keys').insert({ label: predecessor?.label ?? o.label, key_prefix: generated.prefix, key_hash: hashKey(generated.token),
    scopes: ['tasks:read'], project_ids: predecessor?.project_ids ?? [...new Set(projects!.map(Number))],
    created_by: o.actor ? Number(o.actor) : null, rotated_from_id: predecessor?.id ?? null }).select('id').single();
  if (r.error || !r.data) throw new Error('Operation failed');
  // The database assigns expiry and atomically clamps the predecessor on rotation.
  output(generated.token);
}
if (process.argv[1]?.replace(/\\/g, '/').endsWith('/create-bot-key.ts')) {
  runKeyCli(process.argv.slice(2), line => process.stdout.write(`${line}\n`)).catch(() => {
    process.stderr.write('Key operation failed; check arguments and private server configuration.\n'); process.exitCode = 1;
  });
}
