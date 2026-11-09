import type { SupabaseClient } from '@supabase/supabase-js';
import { isIP } from 'node:net';
import type { ApiKey } from './keys';
import { unavailable } from './format';

export interface AuditEntry { rid: string; method: string; route: string; taskId?: number; status: number; code?: string; duration: number; }
export async function audit(db: SupabaseClient, req: Request, key: ApiKey | null, entry: AuditEntry) {
  // Only the platform-overwritten header is considered; never trust generic forwarding headers.
  const candidate = process.env.VERCEL === '1' ? req.headers.get('x-vercel-forwarded-for') : null;
  const ip = candidate && isIP(candidate) ? candidate : null;
  const { error } = await db.from('api_audit_log').insert({
    key_id: key?.id ?? null, key_prefix: key?.key_prefix ?? null, bot_label: key?.label.slice(0, 200) ?? null,
    request_id: entry.rid, method: /^[A-Z]{1,16}$/.test(entry.method) ? entry.method : 'OTHER',
    route: entry.route, task_id: entry.taskId ?? null, status: entry.status, error_code: entry.code ?? null,
    duration_ms: Math.min(2147483647, Math.max(0, Math.round(entry.duration))), ip,
  });
  if (error) throw unavailable();
}
