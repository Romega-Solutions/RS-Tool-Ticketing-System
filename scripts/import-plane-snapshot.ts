// One-time. Idempotent-ish: clears the four tables, then re-imports from
// plane-snapshot.json. Run: `npx tsx scripts/import-plane-snapshot.ts [--dry-run]`
import { readFileSync } from 'node:fs';
import { createAdminClient } from '../src/lib/supabase/admin';

const DRY = process.argv.includes('--dry-run');

async function main() {
  const snap = JSON.parse(readFileSync('plane-snapshot.json', 'utf8'));
  const sb = createAdminClient();

  console.log(`Snapshot: ${snap.projects.length} projects`);
  if (DRY) { console.log('[dry-run] no writes'); return; }

  // Wipe in FK-safe order.
  await sb.from('work_item_assignees').delete().neq('id', 0);
  await sb.from('work_items').delete().neq('id', 0);
  await sb.from('project_states').delete().neq('id', 0);
  await sb.from('projects').delete().neq('id', 0);

  for (const entry of snap.projects) {
    const p = entry.project;
    const maxSeq = entry.items.reduce(
      (m: number, i: any) => Math.max(m, Number(i.sequence_id ?? 0)), 0);

    const { data: proj } = await sb.from('projects').insert({
      identifier: p.identifier || p.id,
      name: p.name,
      description: p.description ?? '',
      network: p.network ?? 2,
      next_sequence: maxSeq + 1,
    }).select('id').single();
    const projectId = proj!.id;

    // States — keep Plane's id->newId map so work items can resolve state.
    const stateMap = new Map<string, number>();
    for (const s of entry.states) {
      const { data: st } = await sb.from('project_states').insert({
        project_id: projectId,
        name: s.name,
        group: String(s.group ?? 'backlog').toLowerCase(),
        color: s.color ?? '#6b7280',
        sequence: s.sequence ?? 0,
      }).select('id').single();
      stateMap.set(s.id, st!.id);
    }

    for (const it of entry.items) {
      const stateId = stateMap.get(it.state) ??
        (it.state_detail ? stateMap.get(it.state_detail.id) : undefined) ?? null;
      const { data: wi } = await sb.from('work_items').insert({
        project_id: projectId,
        sequence_id: it.sequence_id ?? 0,
        name: it.name,
        description: it.description_stripped ?? null,
        priority: it.priority ?? 'none',
        state_id: stateId,
        target_date: it.target_date ?? null,
        completed_at: it.completed_at ?? null,
      }).select('id').single();

      const assignees: string[] = [
        ...(it.assignees ?? []), ...(it.assignee_ids ?? []),
      ].filter(Boolean);
      for (const memberKey of [...new Set(assignees)]) {
        await sb.from('work_item_assignees').insert({
          work_item_id: wi!.id, member_key: String(memberKey),
        });
      }
    }
    console.log(`  imported ${p.name}: ${entry.states.length} states, ${entry.items.length} items`);
  }
  console.log('Import complete.');
}

main().catch(e => { console.error(e); process.exit(1); });
