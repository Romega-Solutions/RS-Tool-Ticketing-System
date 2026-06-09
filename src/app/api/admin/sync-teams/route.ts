import { NextResponse } from 'next/server';
import { route, requireAdmin } from '@/lib/api';
import { syncUserTeamsFromOrgChart } from '@/lib/orgchart';

export const runtime = 'nodejs';

// POST /api/admin/sync-teams        — apply changes
// POST /api/admin/sync-teams?dry=1  — preview without writing
//
// Admin-only. Pulls every active user's department from the org-chart API
// (single source of truth) and updates users.team in place. Returns a per-user
// diff so the admin can see what changed and which accounts didn't match.
export const POST = route(async (req: Request) => {
  await requireAdmin();

  const dryRun = new URL(req.url).searchParams.get('dry') === '1';

  try {
    const summary = await syncUserTeamsFromOrgChart({ dryRun });
    return NextResponse.json({ ok: true, dryRun, ...summary });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 502 },
    );
  }
});
