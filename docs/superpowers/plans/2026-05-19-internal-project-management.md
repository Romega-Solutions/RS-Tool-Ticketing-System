# Internal Project Management (Plane Replacement) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Wave 1 is dispatched via superpowers:dispatching-parallel-agents.

**Goal:** Replace Plane.so as the ticketing source of truth with internal Supabase-backed tables, served and mutated by this Next.js app, with zero behavior change for users.

**Architecture:** A foundation wave builds the schema + a `src/lib/tickets.ts` module whose **exported names and return shapes are byte-for-byte identical to `src/lib/plane.ts`**. Because the interface is mirrored — and `work_item_assignees.member_key` reuses the existing Plane member-id string — the cutover for every page/route collapses to a one-line import swap plus deleting the now-dead "Plane connection failed" branch. That makes the cutover tasks fully independent and parallelizable. A final convergence wave retires Plane, the Python script, and the dead env/columns.

**Tech Stack:** Next.js 16 (App Router), Drizzle ORM (`pg-core`) for schema → SQL generation, Supabase JS client (`createAdminClient`) for runtime queries (matching existing app convention), Vitest, ExcelJS, `tsx` for scripts.

---

## Spec

Source spec: `PLANE_DECOMMISSION_AUDIT.md` (2026-05-19). Read it before starting.

## Key Design Decisions (read before any task)

1. **Mirror interface.** `src/lib/tickets.ts` exports the exact same symbols as `src/lib/plane.ts`: types `PlaneProject`, `PlaneState`, `PlaneMember`, `PlaneWorkItem`, `PlaneApiError`; functions `getProjects`, `getProjectStates`, `getWorkspaceMembers`, `getWorkItems`, `updateWorkItem`, `createWorkItem`, `buildStateLookup`, `enrichWorkItems`, `getStateGroup`, `isActiveGroup`, `isBacklogGroup`, `isCompletedGroup`. Names are kept (not renamed to "Ticket*") **on purpose** — it makes Wave 1 a pure import swap. Renaming is an optional later cleanup, explicitly out of scope here.
2. **Assignee key continuity.** `work_item_assignees.member_key` stores the *same string* currently in `users.plane_member_id`. So `getWorkItems(projectId, { assignee: session.planeMemberId })` keeps working verbatim. `users.plane_member_id` is therefore **NOT dropped in this plan** — it is the join key during and after migration. A future identity-modernization plan can migrate to `users.id`.
3. **Runtime query layer = Supabase JS client**, not Drizzle query builder. Drizzle is used only to author schema and generate SQL (consistent with the rest of the app — see `src/lib/session.ts`, `src/app/(app)/admin/users/page.tsx`). Migrations are applied by pasting generated SQL into the **Supabase SQL Editor** (project convention — `drizzle-kit migrate` is NOT used here).
4. **Group vocabulary frozen.** `project_states.group` uses exactly `backlog | unstarted | started | completed | cancelled`. Report logic (`STATUS_MAP`, `PENDING_GROUPS`, `isCompletedGroup`) then needs zero changes.

## File Structure

| File | Responsibility | Wave |
|------|----------------|------|
| `src/db/schema.ts` (modify) | Add `projects`, `projectStates`, `workItems`, `workItemAssignees` tables | 0 |
| `drizzle/0007_internal_tickets.sql` (generated) | Migration SQL to paste into Supabase | 0 |
| `src/lib/tickets.ts` (create) | Supabase-backed mirror of `src/lib/plane.ts` | 0 |
| `src/__tests__/tickets.test.ts` (create) | Unit tests for pure helpers + categorization | 0 |
| `scripts/export-plane-snapshot.ts` (create) | One-time: Plane API → `plane-snapshot.json` | 0 |
| `scripts/import-plane-snapshot.ts` (create) | One-time: snapshot → Supabase tables | 0 |
| `src/app/(app)/dashboard/page.tsx` (modify) | Import swap + dead-branch removal | 1-A |
| `src/app/(app)/my-tasks/page.tsx` (modify) | Import swap + dead-branch removal | 1-B |
| `src/app/(app)/projects/page.tsx` (modify) | Import swap + dead-branch removal | 1-C |
| `src/app/(app)/projects/[id]/page.tsx` (modify) | Import swap + dead-branch removal | 1-C |
| `src/app/api/reports/generate/route.ts` (modify) | Import swap | 1-D |
| `src/app/api/reports/members/route.ts` (modify) | Import swap | 1-D |
| `src/app/api/weekly-report/plane-data/route.ts` (modify) | Import swap | 1-D |
| `src/app/api/plane/work-items/route.ts` (modify) | Import swap | 1-E |
| `src/app/api/reports/history/route.ts` (modify) | Drop Python `execFile`, read DB-backed history | 2 |
| `src/app/api/reports/download/route.ts` (modify) | Drop Python `execFile` | 2 |
| `report-script/` (delete), `src/lib/plane.ts` (delete) | Retire Plane | 2 |
| `.env.example`, `report-script/.env.example`, `CLAUDE.md` (modify) | Remove Plane refs | 2 |

---

# WAVE 0 — Foundation (SEQUENTIAL, single agent, BLOCKING)

Wave 1 must not start until Wave 0 is reviewed and `npm test` is green.

### Task 1: Add internal ticketing tables to the Drizzle schema

**Files:**
- Modify: `src/db/schema.ts` (append after the `attendance` table)
- Generate: `drizzle/0007_internal_tickets.sql`

- [ ] **Step 1: Append the new tables to `src/db/schema.ts`**

Append at end of file (the file already imports `sql, pgTable, text, integer, serial, jsonb, numeric` from drizzle):

```typescript
export const projects = pgTable('projects', {
  id:          serial('id').primaryKey(),
  identifier:  text('identifier').notNull().unique(),
  name:        text('name').notNull(),
  description: text('description'),
  network:     integer('network').notNull().default(2),
  nextSequence:integer('next_sequence').notNull().default(1),
  archived:    integer('archived').notNull().default(0),
  createdAt:   text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt:   text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const projectStates = pgTable('project_states', {
  id:        serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  name:      text('name').notNull(),
  group:     text('group').notNull(), // backlog|unstarted|started|completed|cancelled
  color:     text('color').notNull().default('#6b7280'),
  sequence:  integer('sequence').notNull().default(0),
});

export const workItems = pgTable('work_items', {
  id:           serial('id').primaryKey(),
  projectId:    integer('project_id').notNull(),
  sequenceId:   integer('sequence_id').notNull(),
  name:         text('name').notNull(),
  description:  text('description'),
  priority:     text('priority').notNull().default('none'),
  stateId:      integer('state_id'),
  targetDate:   text('target_date'),
  completedAt:  text('completed_at'),
  createdBy:    integer('created_by'),
  createdAt:    text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt:    text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const workItemAssignees = pgTable('work_item_assignees', {
  id:         serial('id').primaryKey(),
  workItemId: integer('work_item_id').notNull(),
  memberKey:  text('member_key').notNull(), // == users.plane_member_id (legacy continuity)
});
```

- [ ] **Step 2: Generate the migration SQL**

Run: `npx drizzle-kit generate`
Expected: a new file `drizzle/0007_*.sql` is created containing `CREATE TABLE "projects" ...` for all four tables.

- [ ] **Step 3: Rename the generated file for clarity**

Run: `mv drizzle/0007_*.sql drizzle/0007_internal_tickets.sql` (if drizzle didn't already name it `0007_internal_tickets.sql`, rename it; leave `drizzle/meta` untouched).
Expected: `ls drizzle/ | grep 0007` → `0007_internal_tickets.sql`

- [ ] **Step 4: Apply the migration in Supabase (manual, document it)**

This project applies migrations through the **Supabase SQL Editor**, not `drizzle-kit migrate`. Open the contents of `drizzle/0007_internal_tickets.sql`, paste into Supabase SQL Editor, run it. Verify the four tables exist:
Run (psql via `DATABASE_URL`, or Supabase Table editor): confirm `projects`, `project_states`, `work_items`, `work_item_assignees` exist.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts drizzle/0007_internal_tickets.sql drizzle/meta
git commit -m "feat: internal ticketing schema (projects, states, work items, assignees)"
```

---

### Task 2: Build `src/lib/tickets.ts` — Supabase-backed mirror of `plane.ts`

**Files:**
- Create: `src/lib/tickets.ts`
- Test: `src/__tests__/tickets.test.ts`

- [ ] **Step 1: Write the failing test for pure helpers + categorization**

Create `src/__tests__/tickets.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  buildStateLookup,
  enrichWorkItems,
  getStateGroup,
  isActiveGroup,
  isBacklogGroup,
  isCompletedGroup,
  type PlaneState,
  type PlaneWorkItem,
} from '@/lib/tickets';

const states: PlaneState[] = [
  { id: 's1', name: 'Todo', group: 'backlog', color: '#aaa', sequence: 0 },
  { id: 's2', name: 'Doing', group: 'started', color: '#bbb', sequence: 1 },
  { id: 's3', name: 'Done', group: 'completed', color: '#ccc', sequence: 2 },
];

describe('buildStateLookup', () => {
  it('maps state id -> state', () => {
    const m = buildStateLookup(states);
    expect(m.get('s2')?.name).toBe('Doing');
    expect(m.size).toBe(3);
  });
});

describe('enrichWorkItems', () => {
  it('fills state_detail from the lookup when missing', () => {
    const items: PlaneWorkItem[] = [{
      id: 'w1', sequence_id: 1, name: 'X', state: 's3',
      priority: 'none', assignees: [], created_at: '', updated_at: '',
    }];
    const out = enrichWorkItems(items, buildStateLookup(states));
    expect(out[0].state_detail?.group).toBe('completed');
  });

  it('leaves an item untouched if state_detail already set', () => {
    const items: PlaneWorkItem[] = [{
      id: 'w1', sequence_id: 1, name: 'X', state: 's1',
      state_detail: { id: 's9', name: 'Custom', group: 'started', color: '#000' },
      priority: 'none', assignees: [], created_at: '', updated_at: '',
    }];
    const out = enrichWorkItems(items, buildStateLookup(states));
    expect(out[0].state_detail?.id).toBe('s9');
  });
});

describe('group predicates', () => {
  it('classifies groups the same as plane.ts did', () => {
    expect(isCompletedGroup('completed')).toBe(true);
    expect(isCompletedGroup('started')).toBe(false);
    expect(isBacklogGroup('backlog')).toBe(true);
    expect(isBacklogGroup('todo')).toBe(true);
    expect(isActiveGroup('started')).toBe(true);
    expect(isActiveGroup('in_progress')).toBe(true);
    expect(getStateGroup({
      id: 'w', sequence_id: 1, name: 'n', state: 's',
      state_detail: { id: 's', name: 'D', group: 'Completed', color: '#0' },
      priority: 'none', assignees: [], created_at: '', updated_at: '',
    })).toBe('completed');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tickets`
Expected: FAIL — `Cannot find module '@/lib/tickets'`.

- [ ] **Step 3: Create `src/lib/tickets.ts`**

```typescript
// Server-only — never import this in client components ('use client').
// Drop-in replacement for src/lib/plane.ts, backed by Supabase instead of the Plane API.
import { createAdminClient } from '@/lib/supabase/admin';

export interface PlaneProject {
  id: string;
  name: string;
  identifier: string;
  description: string;
  network: number;
}

export interface PlaneState {
  id: string;
  name: string;
  group: string;
  color: string;
  sequence: number;
}

export interface PlaneMember {
  id: string;
  display_name: string;
  email: string;
  avatar?: string;
}

export interface PlaneWorkItem {
  id: string;
  sequence_id: number;
  name: string;
  description_stripped?: string;
  state: string;
  state_detail?: { id: string; name: string; group: string; color: string };
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  assignees: string[];
  assignee_ids?: string[];
  target_date?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  label_detail?: Array<{ id: string; name: string; color: string }>;
  labels?: string[];
}

// Kept for signature compatibility with callers that catch PlaneApiError.
export class PlaneApiError extends Error {
  constructor(public readonly status: number, path: string) {
    super(`Tickets DB ${status}: ${path}`);
  }
}

type Row = Record<string, unknown>;

function mapProject(r: Row): PlaneProject {
  return {
    id: String(r.id),
    name: String(r.name),
    identifier: String(r.identifier ?? ''),
    description: String(r.description ?? ''),
    network: Number(r.network ?? 2),
  };
}

function mapState(r: Row): PlaneState {
  return {
    id: String(r.id),
    name: String(r.name),
    group: String(r.group),
    color: String(r.color ?? '#6b7280'),
    sequence: Number(r.sequence ?? 0),
  };
}

export async function getProjects(): Promise<PlaneProject[]> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from('projects')
    .select('id, name, identifier, description, network')
    .eq('archived', 0)
    .order('name');
  if (error) throw new PlaneApiError(500, 'projects');
  return (data ?? []).map(mapProject);
}

export async function getProjectStates(projectId: string): Promise<PlaneState[]> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from('project_states')
    .select('id, name, group, color, sequence')
    .eq('project_id', Number(projectId))
    .order('sequence');
  if (error) throw new PlaneApiError(500, `states/${projectId}`);
  return (data ?? []).map(mapState);
}

export async function getWorkspaceMembers(): Promise<PlaneMember[]> {
  const sb = createAdminClient();
  // The Plane member id == users.plane_member_id; surface it as PlaneMember.id
  // so existing member-picker code keeps working unchanged.
  const { data, error } = await sb
    .from('users')
    .select('plane_member_id, name, email')
    .not('plane_member_id', 'is', null)
    .eq('is_active', 1);
  if (error) throw new PlaneApiError(500, 'members');
  return (data ?? []).map((u: Row) => ({
    id: String(u.plane_member_id),
    display_name: String(u.name),
    email: String(u.email ?? ''),
  }));
}

export async function getWorkItems(
  projectId: string,
  params?: Record<string, string>,
): Promise<PlaneWorkItem[]> {
  const sb = createAdminClient();
  let q = sb
    .from('work_items')
    .select('id, sequence_id, name, description, priority, state_id, target_date, completed_at, created_at, updated_at, work_item_assignees(member_key)')
    .eq('project_id', Number(projectId));

  const { data, error } = await q;
  if (error) throw new PlaneApiError(500, `work-items/${projectId}`);

  let items: PlaneWorkItem[] = (data ?? []).map((r: Row) => {
    const assignees = ((r.work_item_assignees as Row[] | null) ?? [])
      .map(a => String(a.member_key));
    return {
      id: String(r.id),
      sequence_id: Number(r.sequence_id ?? 0),
      name: String(r.name),
      description_stripped: r.description ? String(r.description) : undefined,
      state: r.state_id != null ? String(r.state_id) : '',
      priority: (String(r.priority ?? 'none')) as PlaneWorkItem['priority'],
      assignees,
      assignee_ids: assignees,
      target_date: (r.target_date as string | null) ?? null,
      completed_at: (r.completed_at as string | null) ?? null,
      created_at: String(r.created_at ?? ''),
      updated_at: String(r.updated_at ?? ''),
    };
  });

  // Client-side assignee filter — mirrors Plane's ?assignee= param exactly.
  const assignee = params?.assignee;
  if (assignee) items = items.filter(i => i.assignees.includes(assignee));
  return items;
}

export async function updateWorkItem(
  projectId: string,
  itemId: string,
  updates: { state?: string; priority?: string; name?: string; target_date?: string | null },
): Promise<PlaneWorkItem> {
  const sb = createAdminClient();
  const patch: Row = { updated_at: new Date().toISOString() };
  if (updates.state !== undefined) patch.state_id = Number(updates.state);
  if (updates.priority !== undefined) patch.priority = updates.priority;
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.target_date !== undefined) patch.target_date = updates.target_date;

  // If moved into a completed-group state, stamp completed_at; clear it otherwise.
  if (updates.state !== undefined) {
    const { data: st } = await sb.from('project_states')
      .select('group').eq('id', Number(updates.state)).maybeSingle();
    patch.completed_at = st && String(st.group) === 'completed'
      ? new Date().toISOString() : null;
  }

  const { error } = await sb.from('work_items')
    .update(patch).eq('id', Number(itemId)).eq('project_id', Number(projectId));
  if (error) throw new PlaneApiError(502, `work-items/${itemId}`);

  const [one] = await getWorkItems(projectId);
  return (await getWorkItems(projectId)).find(w => w.id === String(itemId)) ?? one;
}

export async function createWorkItem(
  projectId: string,
  data: { name: string; state?: string; priority?: string },
): Promise<PlaneWorkItem> {
  const sb = createAdminClient();
  const pid = Number(projectId);

  // Per-project sequence counter (Plane auto-assigned this).
  const { data: proj } = await sb.from('projects')
    .select('next_sequence').eq('id', pid).maybeSingle();
  const seq = Number(proj?.next_sequence ?? 1);

  const { data: inserted, error } = await sb.from('work_items').insert({
    project_id: pid,
    sequence_id: seq,
    name: data.name,
    priority: data.priority ?? 'none',
    state_id: data.state ? Number(data.state) : null,
  }).select('id').single();
  if (error || !inserted) throw new PlaneApiError(502, `work-items create`);

  await sb.from('projects').update({ next_sequence: seq + 1 }).eq('id', pid);

  const created = (await getWorkItems(projectId)).find(w => w.id === String(inserted.id));
  if (!created) throw new PlaneApiError(502, 'work-items create readback');
  return created;
}

export function buildStateLookup(states: PlaneState[]): Map<string, PlaneState> {
  return new Map(states.map(s => [s.id, s]));
}

export function enrichWorkItems(
  items: PlaneWorkItem[],
  lookup: Map<string, PlaneState>,
): PlaneWorkItem[] {
  return items.map(item => {
    if (item.state_detail) return item;
    const resolved = item.state ? lookup.get(item.state) : undefined;
    if (!resolved) return item;
    return {
      ...item,
      state_detail: {
        id: resolved.id, name: resolved.name,
        group: resolved.group, color: resolved.color,
      },
    };
  });
}

export function getStateGroup(item: PlaneWorkItem): string {
  return (item.state_detail?.group ?? '').toLowerCase();
}
export function isActiveGroup(group: string): boolean {
  return ['started', 'in_progress', 'inprogress', 'in progress', 'unstarted'].includes(group);
}
export function isBacklogGroup(group: string): boolean {
  return ['backlog', 'todo', 'unstarted'].includes(group);
}
export function isCompletedGroup(group: string): boolean {
  return group === 'completed';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tickets`
Expected: PASS — all `tickets.test.ts` cases green.

- [ ] **Step 5: Type-check the module against its callers' expectations**

Run: `npx tsc --noEmit`
Expected: no new errors in `src/lib/tickets.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tickets.ts src/__tests__/tickets.test.ts
git commit -m "feat: tickets.ts — Supabase-backed mirror of plane.ts interface"
```

---

### Task 3: One-time Plane export snapshot script

**Files:**
- Create: `scripts/export-plane-snapshot.ts`

- [ ] **Step 1: Create the export script**

```typescript
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
```

- [ ] **Step 2: Run the export against live Plane**

Run: `npx tsx scripts/export-plane-snapshot.ts`
Expected: `plane-snapshot.json` created; console prints per-project counts; exit 0.

- [ ] **Step 3: Sanity-check the snapshot**

Run: `node -e "const s=require('./plane-snapshot.json');console.log(s.projects.length,'projects',s.members.length,'members')"`
Expected: non-zero project and member counts that match what you see in Plane's UI.

- [ ] **Step 4: Commit the script (NOT the snapshot)**

```bash
echo "plane-snapshot.json" >> .gitignore
git add scripts/export-plane-snapshot.ts .gitignore
git commit -m "chore: one-time Plane export snapshot script"
```

---

### Task 4: One-time snapshot → Supabase import script

**Files:**
- Create: `scripts/import-plane-snapshot.ts`

- [ ] **Step 1: Create the import script**

```typescript
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
```

- [ ] **Step 2: Dry-run**

Run: `npx tsx scripts/import-plane-snapshot.ts --dry-run`
Expected: prints project count, `[dry-run] no writes`, exit 0.

- [ ] **Step 3: Real import**

Run: `npx tsx scripts/import-plane-snapshot.ts`
Expected: per-project import lines, `Import complete.`, exit 0.

- [ ] **Step 4: Verify counts match the snapshot**

Run: `node -e "const s=require('./plane-snapshot.json');let i=0;for(const p of s.projects)i+=p.items.length;console.log('snapshot items:',i)"`
Then query Supabase: `select count(*) from work_items;` — the two numbers must match.
Expected: equal counts. If not, STOP and reconcile before Wave 1.

- [ ] **Step 5: Commit the script**

```bash
git add scripts/import-plane-snapshot.ts
git commit -m "chore: one-time Plane snapshot -> Supabase import script"
```

---

## WAVE 0 REVIEW GATE

Do not proceed until: `npm test` green, `npx tsc --noEmit` clean, and `select count(*) from work_items` equals snapshot item count. Use superpowers:requesting-code-review on the Wave 0 commits.

---

# WAVE 1 — Parallel Cutover (DISPATCH 5 AGENTS CONCURRENTLY)

Dispatch via superpowers:dispatching-parallel-agents. Each agent edits a **disjoint file set**, imports the *already-built, frozen* `src/lib/tickets.ts` (read-only for them), and must not modify `tickets.ts`, the schema, or another agent's files. Each agent commits its own change.

**Shared mechanical recipe (give to every Wave 1 agent verbatim):**

> In each assigned file, change the import source `'@/lib/plane'` to `'@/lib/tickets'`. Keep every imported symbol name identical (they are mirrored). Do NOT change any other logic, types, or the `session.planeMemberId` filter — `tickets.ts` preserves Plane's assignee semantics, so existing filters work unchanged. Then handle the now-dead Plane error UI per the per-agent instructions below. After editing, run `npx tsc --noEmit` (must be clean for your files) and `npm run lint`. Commit with a single-line message.

### Wave 1 — Agent A: Dashboard

**File:** `src/app/(app)/dashboard/page.tsx`
- [ ] Change `import { ... } from '@/lib/plane'` → `from '@/lib/tickets'` (line ~2).
- [ ] The `planeError` catch path can never fire now (DB errors throw too, so keep the variable but reword the banner at ~line 228–233): replace the copy referencing `PLANE_BASE_URL`/`PLANE_API_KEY`/`PLANE_WORKSPACE_SLUG`/`.env` with: `Could not load project data. Try refreshing; if it persists, contact an admin.` Keep the conditional render.
- [ ] Replace user-facing string at ~line 368 `"My Tasks will appear here once your Plane account is linked."` → `"My Tasks will appear here once your member profile is linked. Ask an admin."`
- [ ] Run `npx tsc --noEmit` (clean) and `npm run lint`. Commit: `refactor: dashboard reads tickets from internal DB`.

### Wave 1 — Agent B: My Tasks

**File:** `src/app/(app)/my-tasks/page.tsx`
- [ ] Change import (line 2) `@/lib/plane` → `@/lib/tickets`. Imported names (`getProjects, getProjectStates, getWorkItems, buildStateLookup, enrichWorkItems, PlaneWorkItem, PlaneState`) stay identical.
- [ ] At ~line 69, the catch sets `planeError`. Reword the rendered message (~line 100–104) from `"Plane connection failed: …"` to `"Couldn't load your tasks. Refresh; if it persists, contact an admin."`
- [ ] At ~line 93–96, the `!planeMemberId` notice: change copy `"Your Plane account isn't linked. Ask your admin to set your Plane Member ID…"` → `"Your member profile isn't linked yet. Ask an admin to link it in your profile."` (Keep the `planeMemberId` variable and condition — it is still the join key.)
- [ ] Run `npx tsc --noEmit` (clean) and `npm run lint`. Commit: `refactor: my-tasks reads tickets from internal DB`.

### Wave 1 — Agent C: Projects + Project board

**Files:** `src/app/(app)/projects/page.tsx`, `src/app/(app)/projects/[id]/page.tsx`
- [ ] In both files change `@/lib/plane` → `@/lib/tickets` (projects/page.tsx line 2; projects/[id]/page.tsx line 1).
- [ ] `projects/page.tsx` ~line 42: replace the `Plane connection failed: … Check PLANE_BASE_URL…` banner with `Couldn't load projects. Refresh; if it persists, contact an admin.` ~line 99: change `"Projects will appear here once Plane is connected."` → `"No projects yet."`
- [ ] `projects/[id]/page.tsx` ~line 47/54/60: replace `Plane connection failed:` text with `Couldn't load this board.`; change `"No states configured for this project in Plane."` → `"No workflow states configured for this project."`; remove the `· Drag cards…` clause only if it referenced Plane (keep drag copy — drag still works).
- [ ] Run `npx tsc --noEmit` (clean) and `npm run lint`. Commit: `refactor: projects + board read tickets from internal DB`.

### Wave 1 — Agent D: Reports + Weekly report data

**Files:** `src/app/api/reports/generate/route.ts`, `src/app/api/reports/members/route.ts`, `src/app/api/weekly-report/plane-data/route.ts`
- [ ] In all three, change the `@/lib/plane` import to `@/lib/tickets`. Imported symbols are identical (`getProjects, getProjectStates, getWorkItems, buildStateLookup, enrichWorkItems, isCompletedGroup, getWorkspaceMembers, PlaneWorkItem`).
- [ ] `weekly-report/plane-data/route.ts`: the early guard `const planeConfigured = !!(process.env.PLANE_BASE_URL && process.env.PLANE_API_KEY)` is now always-false in prod (vars being removed in Wave 2). Change it to `const planeConfigured = true;` and keep the response key `planeConfigured` (the client reads it; renaming is out of scope). Leave the `!session.planeMemberId` branch as-is.
- [ ] Do NOT change report column logic, `STATUS_MAP`, `PENDING_GROUPS` — group vocabulary is preserved by design.
- [ ] Run `npx tsc --noEmit` (clean), `npm run lint`. Commit: `refactor: reports + weekly-report data read tickets from internal DB`.

### Wave 1 — Agent E: Work-item write path

**File:** `src/app/api/plane/work-items/route.ts`
- [ ] Change `import { updateWorkItem, createWorkItem } from '@/lib/plane'` → `from '@/lib/tickets'`.
- [ ] No other change. The route already passes `{ projectId, itemId, state, priority, name, target_date }` which `tickets.updateWorkItem`/`createWorkItem` accept with identical signatures. Do NOT rename the route path (kanban-board.tsx posts to `/api/plane/work-items`; renaming is deferred cleanup).
- [ ] Run `npx tsc --noEmit` (clean), `npm run lint`. Commit: `refactor: work-item create/update write to internal DB`.

## WAVE 1 INTEGRATION CHECK (you, after all 5 agents return)

- [ ] Confirm the 5 agents touched only their assigned files (no overlap): `git log --oneline -5` + `git show --stat` each.
- [ ] Run `npm run verify` (lint + build). Expected: success.
- [ ] Run full `npm test`. Expected: all green (existing rbac/attendance/overtime/presence/tickets suites).
- [ ] Manual smoke (dev server `npm run dev`): log in → Dashboard shows imported projects/tasks → My Tasks lists items for a user whose `plane_member_id` is set → open a project board → drag a card to another column (persists on reload) → add a card → generate a weekly report (.xlsx downloads, sections 4/5 populated). If any fails, use superpowers:systematic-debugging before Wave 2.

---

# WAVE 2 — Convergence & Retire Plane (SEQUENTIAL, single agent)

### Task 5: Cut `/api/reports/history` and `/api/reports/download` off Python

**Files:** `src/app/api/reports/history/route.ts`, `src/app/api/reports/download/route.ts`

- [ ] **Step 1: Read both routes fully** to see exactly what Python output they parse (they currently `execFile` `python3 … report-script/`).
- [ ] **Step 2:** Replace the Python shell-out. `generate` already streams the xlsx directly (no disk), so "history" of generated files no longer exists on disk. Implement history as: return an empty list `{ reports: [] }` **only if** product confirms history is unused; OR (preferred) add a `report_runs` table (`id, user_id, member_name, week_start, generated_at`) written by `generate/route.ts` and have `history` read it. Pick based on whether the History UI is shown to users — check `src/app/(app)/reports/page.tsx`. Implement the chosen path with full code (no placeholder) in the route.
- [ ] **Step 3:** `download/route.ts`: since reports are generated on demand and streamed, change it to 410 Gone / redirect to the generate action, OR (if `report_runs` added) re-generate by stored params. Implement concretely.
- [ ] **Step 4:** Run `npm run verify`. Expected: success.
- [ ] **Step 5:** Commit: `refactor: report history/download no longer shell out to Python`.

### Task 6: Delete Plane & the Python script

- [ ] **Step 1:** Confirm no remaining importers: `grep -rn "@/lib/plane" src/` → expected: **no results**.
- [ ] **Step 2:** Delete: `rm src/lib/plane.ts` and `rm -rf report-script/`.
- [ ] **Step 3:** Remove Plane env from `.env.example` (lines ~34–45 block) and delete `report-script/.env.example` (gone with the dir). Remove `REPORT_SCRIPT_DIR`/`REPORT_SCRIPT_PYTHON` vars if now unused (grep first).
- [ ] **Step 4:** Update `CLAUDE.md`: remove the "Plane.so (source of truth)" diagram, the Plane env-var table rows, and the "Report Script (Python)" command section; replace the architecture line with the internal Supabase model.
- [ ] **Step 5:** Run `npm run verify` + `npm test`. Expected: all green.
- [ ] **Step 6:** Commit: `chore: retire Plane.so and the Python report script`.

### Task 7: Mark the audit superseded

- [ ] **Step 1:** Add a one-line banner at the top of `PLANE_INTEGRATION_AUDIT.md`: `> SUPERSEDED 2026-05-19 — see PLANE_DECOMMISSION_AUDIT.md. Plane has been internalized.`
- [ ] **Step 2:** Commit: `docs: mark old Plane integration audit superseded`.

> **Note:** `users.plane_member_id` is intentionally **retained** (it is the live assignee join key — see Key Design Decision #2). Dropping it requires migrating assignee identity to `users.id` and is explicitly a **separate future plan**, not part of this one.

---

## Self-Review (completed by plan author)

- **Spec coverage:** Audit §2 touchpoints → Wave 1 Agents A–E + Task 5/6 (history/download Python). Audit §4 schema → Task 1. §3 contract → Task 2 (`tickets.ts` mirror). §5 phases 0–5 → Waves 0/1/2. §6 risks → covered (count-verify gate in Task 4 Step 4; sequence counter in Task 1/createWorkItem; group vocab frozen per Decision #4; half-migrated Python explicitly closed in Task 5; `planeMemberId` retention documented). One deliberate scope reduction: dropping `plane_member_id` and renaming `Plane*`→`Ticket*` are deferred (documented), reducing Wave 1 to pure import swaps.
- **Placeholder scan:** Task 5 Step 2/3 intentionally branch on a product fact (is History UI shown) the executing agent must check in `reports/page.tsx` and then implement fully — flagged, not a silent TODO.
- **Type consistency:** `tickets.ts` exports the exact symbol names/shapes of `plane.ts` (verified against `src/lib/plane.ts` export list). `PlaneWorkItem.state` is the state id string in both; `getWorkItems(projectId, { assignee })` signature preserved; `updateWorkItem`/`createWorkItem` argument objects match the existing `/api/plane/work-items` route body.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-19-internal-project-management.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I run Wave 0 with a fresh subagent per task and review between tasks, then dispatch Wave 1's 5 agents in parallel, then Wave 2 sequentially.

**2. Inline Execution** — I execute the tasks in this session with checkpoints for your review at each wave gate.

**Which approach?**
