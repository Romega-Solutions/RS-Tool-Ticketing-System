import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sweepOpenSessions } from '@/lib/overtime-server';
import { route, requireBearer } from '@/lib/api';

export const runtime = 'nodejs';

// GET /api/cron/auto-clock-out
// Absolute backstop sweep, hit on the daily Vercel cron (and any external n8n
// trigger). Closes open sessions per the overtime policy:
//   * 15h Mon–Sun weekly cap (every role, incl. admin) — no per-session/day cap
//   * 16h absolute safety ceiling (every role, incl. admin — ghost-session guard)
// An active admin overtime approval suspends the weekly cap for that user.
// The same sweep runs throttled on app activity (see maybeSweepOpenSessions), so
// the cap is enforced continuously while the app is in use — this cron only has
// to catch the case where nobody opens the app for a stretch.
export const GET = route(async (req: Request) => {
  requireBearer(req, process.env.CRON_SECRET);

  const admin = createAdminClient();
  const now = new Date();
  const result = await sweepOpenSessions(admin, now);

  // Best-effort prune of rate-limit windows older than a day (PostgREST path).
  try {
    const cutoff = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
    await admin.from('rate_limits').delete().lt('window_start', cutoff);
  } catch (err) {
    console.error('[cron] rate_limits prune failed:', err);
  }

  return NextResponse.json({ ranAt: now.toISOString(), ...result });
});
