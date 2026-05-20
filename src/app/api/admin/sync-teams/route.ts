import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { canAccessAdmin } from '@/lib/rbac';
import { syncUserTeamsFromOrgChart } from '@/lib/orgchart';

export const runtime = 'nodejs';

// POST /api/admin/sync-teams        — apply changes
// POST /api/admin/sync-teams?dry=1  — preview without writing
//
// Admin-only. Pulls every active user's department from the org-chart API
// (single source of truth) and updates users.team in place. Returns a per-user
// diff so the admin can see what changed and which accounts didn't match.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canAccessAdmin(session.role)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

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
}
