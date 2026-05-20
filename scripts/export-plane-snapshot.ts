// Snapshot of the tickets tables — emits plane-snapshot.json next to the
// repo root. (Originally read from the live Plane API; now reads from
// the internal tickets DB, which is the post-migration source of truth.)
import { writeFileSync } from 'node:fs';
import {
  getProjects, getProjectStates, getWorkItems, getWorkspaceMembers,
} from '../src/lib/tickets';

async function main() {
  const members = await getWorkspaceMembers();
  const projects = await getProjects();
  const out: {
    exportedAt: string;
    members: Awaited<ReturnType<typeof getWorkspaceMembers>>;
    projects: Array<{
      project: Awaited<ReturnType<typeof getProjects>>[number];
      states: Awaited<ReturnType<typeof getProjectStates>>;
      items: Awaited<ReturnType<typeof getWorkItems>>;
    }>;
  } = { exportedAt: new Date().toISOString(), members, projects: [] };

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
