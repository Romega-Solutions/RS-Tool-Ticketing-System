import { NextResponse } from 'next/server';
import { autoArchiveCompletedTasks } from '@/lib/tickets';
import { route, requireBearer } from '@/lib/api';

export const runtime = 'nodejs';

// GET /api/cron/archive-done
// Daily Vercel cron. For every project with auto-archive enabled
// (projects.auto_archive_done_days > 0), archives Done tasks whose
// completed_at is older than that window. Idempotent; CRON_SECRET-gated.
export const GET = route(async (req: Request) => {
  requireBearer(req, process.env.CRON_SECRET);

  const now = new Date();
  const result = await autoArchiveCompletedTasks();
  return NextResponse.json({ ranAt: now.toISOString(), ...result });
});
