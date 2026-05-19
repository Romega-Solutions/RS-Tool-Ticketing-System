// One-time. Run BEFORE deleting plane.ts: `npx tsx scripts/export-plane-snapshot.ts`
// Emits plane-snapshot.json next to the repo root.
import { writeFileSync } from 'node:fs';
import {
  getProjects, getProjectStates, getWorkItems, getWorkspaceMembers,
} from '../src/lib/plane';

async function main() {
  const members = await getWorkspaceMembers();
  const projects = await getProjects();
  const out: any = { exportedAt: new Date().toISOString(), members, projects: [] };

  for (const p of projects) {
    const [states, items] = await Promise.all([
      getProjectStates(p.id),
      getWorkItems(p.id),
    ]);
    out.projects.push({ project: p, states, items });
    console.log(`  ${p.name}: ${states.length} states, ${items.length} items`);
  }

  writeFileSync('plane-snapshot.json', JSON.stringify(out, null, 2));
  console.log(`Wrote plane-snapshot.json (${projects.length} projects, ${members.length} members)`);
}

main().catch(e => { console.error(e); process.exit(1); });
