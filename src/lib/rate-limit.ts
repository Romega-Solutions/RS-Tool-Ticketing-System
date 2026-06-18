import { createAdminClient } from '@/lib/supabase/admin';
import { tooManyRequests } from '@/lib/api';

// Fixed-window API rate limiter backed by the `rate_limits` table, accessed
// through the Supabase PostgREST client (SERVICE_ROLE_KEY) — the same data path
// the rest of the app uses. (We deliberately do NOT use the drizzle/DATABASE_URL
// client here: nothing else in the app uses it and the pooler URL is frequently
// unset/stale, which would make the limiter silently fail open.)
//
// Read-then-upsert per window: not strictly atomic, so under heavy concurrency a
// couple of requests can slip at a window boundary. That's an acceptable
// trade-off for an abuse guard; if strict counting is ever needed, move the
// increment into a Postgres RPC. Fails OPEN: a limiter/DB outage must not take
// down a route.

/** Start of the fixed window containing `now`, as an ISO string. Pure. */
export function windowStartIso(now: Date, windowSeconds: number): string {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms).toISOString();
}

/** Seconds remaining in the current window (min 1). Pure. */
export function retryAfterSeconds(now: Date, windowSeconds: number): number {
  const elapsedSec = Math.floor((now.getTime() % (windowSeconds * 1000)) / 1000);
  return Math.max(1, windowSeconds - elapsedSec);
}

export function keyByUser(tag: string, userId: number | string): string {
  return `${tag}:u:${userId}`;
}

export function keyByIp(tag: string, ip: string): string {
  return `${tag}:ip:${ip}`;
}

/** Best client IP from proxy headers. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

export type RateLimitOpts = {
  key: string;
  limit: number;
  windowSeconds: number;
  now?: Date;
};

/** Non-throwing core. Returns ok=false when the window count exceeds limit. */
export async function checkRateLimit(
  { key, limit, windowSeconds, now = new Date() }: RateLimitOpts,
): Promise<{ ok: boolean; retryAfterSec: number; count: number }> {
  const windowStart = windowStartIso(now, windowSeconds);
  try {
    const sb = createAdminClient();
    const { data: existing, error: readErr } = await sb
      .from('rate_limits')
      .select('count')
      .eq('key', key)
      .eq('window_start', windowStart)
      .maybeSingle();
    if (readErr) throw readErr;

    const next = ((existing?.count as number | undefined) ?? 0) + 1;
    const { error: writeErr } = await sb
      .from('rate_limits')
      .upsert({ key, window_start: windowStart, count: next }, { onConflict: 'key,window_start' });
    if (writeErr) throw writeErr;

    return { ok: next <= limit, retryAfterSec: retryAfterSeconds(now, windowSeconds), count: next };
  } catch (err) {
    console.error('[rate-limit] check failed, failing open:', err);
    return { ok: true, retryAfterSec: 0, count: 0 };
  }
}

/** Throwing variant for routes that use the `route()` wrapper. */
export async function enforceRateLimit(opts: RateLimitOpts): Promise<void> {
  const { ok, retryAfterSec } = await checkRateLimit(opts);
  if (!ok) throw tooManyRequests(retryAfterSec);
}
