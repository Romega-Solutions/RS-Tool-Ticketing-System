import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { rateLimits } from '@/db/schema';
import { tooManyRequests } from '@/lib/api';

// Fixed-window API rate limiter backed by the `rate_limits` table. Atomic at the
// DB (INSERT ... ON CONFLICT ... count + 1 RETURNING) so it is correct across
// serverless instances. Fails OPEN: a limiter outage must not take down a route.

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
    const rows = await db
      .insert(rateLimits)
      .values({ key, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimits.key, rateLimits.windowStart],
        set: { count: sql`${rateLimits.count} + 1` },
      })
      .returning({ count: rateLimits.count });
    const count = rows[0]?.count ?? 1;
    return { ok: count <= limit, retryAfterSec: retryAfterSeconds(now, windowSeconds), count };
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
