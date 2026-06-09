import { NextResponse } from 'next/server';
import { getCanonicalTeams, mapOrgDeptToAppTeam } from '@/lib/orgchart';
import { createAdminClient } from '@/lib/supabase/admin';
import { route, requireSession } from '@/lib/api';

export const runtime = 'nodejs';

// GET /api/tickets/teams
// Returns the canonical list of teams from the org-chart API (single source
// of truth), merged with any team values currently present on active users
// or projects so the dropdown can still represent legacy values until those
// rows are migrated.
export const GET = route(async () => {
  await requireSession();

  const canonical = await getCanonicalTeams();
  const set = new Set<string>(canonical);

  // Surface any not-yet-canonical values currently in use so the dropdown
  // doesn't strand existing assignments. They're normalized through
  // `mapOrgDeptToAppTeam` so close matches collapse onto the canonical name.
  const sb = createAdminClient();
  const [{ data: userTeams }, { data: projTeams }] = await Promise.all([
    sb.from('users').select('team').eq('is_active', 1).not('team', 'is', null),
    sb.from('projects').select('team').eq('archived', 0).not('team', 'is', null),
  ]);
  for (const row of [...(userTeams ?? []), ...(projTeams ?? [])]) {
    const t = String((row as { team: string | null }).team ?? '').trim();
    if (t) set.add(mapOrgDeptToAppTeam(t));
  }

  return NextResponse.json([...set].sort((a, b) => a.localeCompare(b)));
});
