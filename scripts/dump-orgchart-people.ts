// Dump every person from the org-chart API to a JSON file for review.
//
//   npx tsx scripts/dump-orgchart-people.ts                       # → docs/orgchart-people.json
//   npx tsx scripts/dump-orgchart-people.ts path/to/output.json   # custom path
//
// Each entry contains the raw fields PLUS:
//   - canonicalTeam: what `mapOrgDeptToAppTeam` resolves the dept to.
//   - manager:       the name of their reports-to person, if any.
// Plus a `_meta` section at the top with active/total counts and a
// department breakdown so you can eyeball who's where.

import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fetchPeople, mapOrgDeptToAppTeam } from '../src/lib/orgchart';

async function main() {
  const outPath = resolve(process.argv[2] ?? 'docs/orgchart-people.json');
  console.log(`[dump-orgchart] fetching from org-chart API…`);

  const raw = await fetchPeople();
  if (raw.length === 0) {
    console.error('[dump-orgchart] org-chart API returned no people — is ORG_CHART_API_KEY set?');
    process.exit(1);
  }

  const byId = new Map(raw.map(p => [p.id, p]));

  const people = raw.map(p => {
    const isActive = p.isActive !== false && p.isActive !== 0;
    const rawDept  = p.departmentName ?? '';
    const manager  = p.reportsTo ? byId.get(p.reportsTo) : null;
    return {
      id:               p.id,
      name:             p.name,
      title:            p.title,
      email:            p.email ?? null,
      departmentId:     p.departmentId,
      rawDepartment:    rawDept || null,
      canonicalTeam:    rawDept ? mapOrgDeptToAppTeam(rawDept) : null,
      departmentColor:  p.departmentColor ?? null,
      reportsToId:      p.reportsTo ?? null,
      reportsToName:    manager?.name ?? null,
      photoUrl:         p.photoUrl ?? null,
      isActive,
    };
  });

  const active = people.filter(p => p.isActive);

  // Department breakdown (active only)
  const breakdown: Record<string, number> = {};
  for (const p of active) {
    const key = p.canonicalTeam ?? '(no department)';
    breakdown[key] = (breakdown[key] ?? 0) + 1;
  }

  const out = {
    _meta: {
      fetchedAt:    new Date().toISOString(),
      total:        people.length,
      active:       active.length,
      inactive:     people.length - active.length,
      departments:  Object.fromEntries(
        Object.entries(breakdown).sort((a, b) => a[0].localeCompare(b[0])),
      ),
    },
    people,
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`[dump-orgchart] wrote ${people.length} people (${active.length} active) → ${outPath}`);
  console.log(`[dump-orgchart] departments:`);
  for (const [dept, n] of Object.entries(out._meta.departments)) {
    console.log(`  ${String(n).padStart(3, ' ')}  ${dept}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
