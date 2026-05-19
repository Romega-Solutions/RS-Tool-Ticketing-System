// One-time, DESTRUCTIVE: deletes ALL rows in the four ticketing tables, then re-imports
// plane-snapshot.json. Run: `npx tsx scripts/import-plane-snapshot.ts [--dry-run]`
import { readFileSync } from 'node:fs';
import { createAdminClient } from '../src/lib/supabase/admin';

const DRY = process.argv.includes('--dry-run');

async function main() {
  const snap = JSON.parse(readFileSync('plane-snapshot.json', 'utf8'));
  const sb = createAdminClient();

  console.log(`Snapshot: ${snap.projects.length} projects`);
  if (DRY) { console.log('[dry-run] no writes'); return; }

  // Wipe in FK-safe order (children before parents).
  const wipeTables = ['work_item_assignees', 'work_items', 'project_states', 'projects'] as const;
  for (const t of wipeTables) {
    const { error } = await sb.from(t).delete().neq('id', 0);
    if (error) throw new Error(`Failed to wipe ${t}: ${error.message}`);
  }

  for (const entry of snap.projects) {
    const p = entry.project;
    const maxSeq = entry.items.reduce(
      (m: number, i: { sequence_id?: number | null }) => Math.max(m, Number(i.sequence_id ?? 0)), 0);

    const { data: proj, error: projErr } = await sb.from('projects').insert({
      identifier: p.identifier || p.id,
      name: p.name,
      description: p.description ?? '',
      network: p.network ?? 2,
      next_sequence: maxSeq + 1,
    }).select('id').single();
    if (projErr || !proj) throw new Error(`Failed to insert project "${p.name}": ${projErr?.message ?? 'no row returned'}`);
    const projectId = proj.id;

    // States — keep Plane's id->newId map so work items can resolve state.
    const stateMap = new Map<string, number>();
    for (const s of entry.states) {
      const { data: st, error: stErr } = await sb.from('project_states').insert({
        project_id: projectId,
        name: s.name,
        group: String(s.group ?? 'backlog').toLowerCase(),
        color: s.color ?? '#6b7280',
        sequence: s.sequence ?? 0,
      }).select('id').single();
      if (stErr || !st) throw new Error(`Failed to insert state "${s.name}" in project "${p.name}": ${stErr?.message ?? 'no row returned'}`);
      stateMap.set(s.id, st.id);
    }

    for (const it of entry.items) {
      const stateId = stateMap.get(it.state) ??
        (it.state_detail ? stateMap.get(it.state_detail.id) : undefined) ?? null;
      if (stateId === null && it.state) {
        console.warn(`  WARN: state "${it.state}" not found for item #${it.sequence_id} "${it.name}" — importing with no state`);
      }

      if (it.sequence_id == null) {
        throw new Error(`Snapshot work item "${it.name}" in project "${p.name}" has no sequence_id — snapshot is corrupt; aborting before partial import`);
      }

      const { data: wi, error: wiErr } = await sb.from('work_items').insert({
        project_id: projectId,
        sequence_id: it.sequence_id,
        name: it.name,
        description: it.description_stripped ?? null,
        priority: it.priority ?? 'none',
        state_id: stateId,
        target_date: it.target_date ?? null,
        completed_at: it.completed_at ?? null,
      }).select('id').single();
      if (wiErr || !wi) throw new Error(`Failed to insert work item "${it.name}" (seq ${it.sequence_id}) in project "${p.name}": ${wiErr?.message ?? 'no row returned'}`);

      const assignees: string[] = [
        ...(it.assignees ?? []), ...(it.assignee_ids ?? []),
      ].filter(Boolean);
      for (const memberKey of [...new Set(assignees)]) {
        const { error: aErr } = await sb.from('work_item_assignees').insert({
          work_item_id: wi.id, member_key: String(memberKey),
        });
        if (aErr) throw new Error(`Failed to insert assignee "${memberKey}" for work item "${it.name}": ${aErr.message}`);
      }
    }
    console.log(`  imported ${p.name}: ${entry.states.length} states, ${entry.items.length} items`);
  }
  console.log('Import complete.');
}

main().catch(e => { console.error(e); process.exit(1); });
