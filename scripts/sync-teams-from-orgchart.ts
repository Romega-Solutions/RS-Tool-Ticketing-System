// Sync every active user's `team` from the org-chart API.
// Usage:
//   npx tsx scripts/sync-teams-from-orgchart.ts            # apply
//   npx tsx scripts/sync-teams-from-orgchart.ts --dry-run  # preview only
//
// Requires: ORG_CHART_API_KEY + Supabase env vars in .env.

import 'dotenv/config';
import { syncUserTeamsFromOrgChart } from '../src/lib/orgchart';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`[sync-teams] dryRun=${dryRun} — calling org chart…`);

  const result = await syncUserTeamsFromOrgChart({ dryRun });

  console.log(`[sync-teams] total=${result.totalUsers}  updated=${result.updated}  unchanged=${result.unchanged}  unmatched=${result.unmatched}  errors=${result.errors}`);
  for (const d of result.details) {
    const arrow = d.status === 'updated' ? '→' : '·';
    console.log(`  [${d.status.padEnd(9)}] ${d.name.padEnd(28)} ${d.email.padEnd(36)} ${d.from ?? '—'} ${arrow} ${d.to ?? '—'}${d.error ? `  ERROR: ${d.error}` : ''}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
