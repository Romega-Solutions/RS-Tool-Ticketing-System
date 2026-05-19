# Plane.so Decommission & Internalization Audit

**Date:** 2026-05-19
**Auditor:** Claude Code
**Decision:** Stop depending on Plane.so. Rebuild its functions internally on Supabase (Postgres) inside this Next.js app.

> Supersedes `PLANE_INTEGRATION_AUDIT.md` (2026-05-05), which planned to *keep and fix* Plane. That document is now historical. Stack direction: n8n + Supabase + Gemini + this Next.js app only.

---

## 1. Why This Audit Exists

Plane.so is currently the **single source of truth** for all ticketing data — projects, work items, states, and the member roster. None of it lives in our database. Every project/task screen renders by calling the Plane REST API at request time. If Plane is slow, down, rate-limited, or its API key lapses, the dashboard, My Tasks, project boards, weekly reports, and report exports all degrade or break.

The goal: make this app self-contained. Plane's data model and behaviors get reproduced in Supabase tables we own, served and mutated locally.

---

## 2. Current State — Every Plane Touchpoint

### 2.1 The TypeScript client (the spine)

**`src/lib/plane.ts`** — server-only Plane REST client. All live Plane access flows through here.

| Function | Plane endpoint | Used by |
|----------|----------------|---------|
| `getProjects()` | `GET /projects/` | dashboard, projects, projects/[id], reports/generate, weekly-report/plane-data |
| `getProjectStates(id)` | `GET /projects/{id}/states/` | same as above (kanban columns + status resolution) |
| `getWorkItems(id, params)` | `GET /projects/{id}/work-items/` (paginated) | dashboard, my-tasks, projects/[id], reports/generate, weekly-report/plane-data |
| `getWorkspaceMembers()` | `GET /members/` | reports/members |
| `updateWorkItem(p,i,upd)` | `PATCH /projects/{p}/work-items/{i}/` | api/plane/work-items (kanban drag, edit) |
| `createWorkItem(p,data)` | `POST /projects/{p}/work-items/` | api/plane/work-items (add card) |
| `buildStateLookup` / `enrichWorkItems` / `isCompletedGroup` | pure helpers | report + board logic |

### 2.2 Pages that read Plane data at request time

| Page | Plane usage |
|------|-------------|
| `src/app/(app)/dashboard/page.tsx` | projects + states + work items → project stats + "my tasks" (keyed off `session.planeMemberId`) |
| `src/app/(app)/my-tasks/page.tsx` | work items filtered by `planeMemberId` across all projects |
| `src/app/(app)/projects/page.tsx` | projects + aggregated work items |
| `src/app/(app)/projects/[id]/page.tsx` | states + work items → kanban board |
| `src/app/(app)/weekly-report/page.tsx` | passes `planeMemberId` to the report form |
| `src/app/(app)/reports/page.tsx` | report UI, Plane workspace member picker |

Every one of these has a "Plane connection failed" error branch — confirming Plane is a hard runtime dependency for the core product surface.

### 2.3 API routes

| Route | Plane dependency | Notes |
|-------|------------------|-------|
| `POST/PATCH /api/plane/work-items` | `createWorkItem`, `updateWorkItem` | The only **write** path. Kanban drag-drop + add card. |
| `GET /api/weekly-report/plane-data` | projects/states/work items | Auto-fills weekly report sections 4 & 5 |
| `POST /api/reports/generate` | projects/states/work items | **Already migrated** to native TS + ExcelJS (no Python). Only the *data source* is still Plane. |
| `GET /api/reports/members` | `getWorkspaceMembers` | Member picker for leads/admin |
| `GET /api/reports/history` | — (shells to Python) | Still `execFile` Python — see 2.5 |
| `GET /api/reports/download` | — (shells to Python) | Still `execFile` Python — see 2.5 |

### 2.4 Identity bridge

`users.planeMemberId` (`src/db/schema.ts:11`) is the **only** link between a local account and Plane. Set manually in `/admin/users`. Every "my tasks" / per-user report query depends on it. **When Plane is gone, this column becomes dead** — internal work items will reference `users.id` directly.

### 2.5 Stale Python report script (`report-script/`)

`generate_report.py` and `check_members.py` still hit Plane directly and still use patterns flagged in the old audit (deprecated `/issues/` fallback, etc.). **`/api/reports/generate` no longer uses them** — it was rewritten in TypeScript. But `/api/reports/history` and `/api/reports/download` *still shell out to Python* (`execFile`, `python3` resolution). This is an inconsistent half-migrated state: the Python script is partially orphaned and should be retired or its remaining two consumers rewritten.

### 2.6 Environment / config

- Root `.env.example:34-45` — `PLANE_BASE_URL`, `PLANE_API_KEY`, `PLANE_WORKSPACE_SLUG`, `PLANE_PROJECT_SLUG`
- `report-script/.env.example` — same set
- `CLAUDE.md` documents the Plane vars and the "Plane.so (source of truth)" architecture diagram — will need updating once internalized.

---

## 3. What Plane Actually Gives Us (the contract to reproduce)

Distilled from `PlaneProject` / `PlaneState` / `PlaneWorkItem` / `PlaneMember` in `src/lib/plane.ts`:

1. **Projects** — id, name, identifier, description.
2. **States per project** — id, name, `group` (`backlog|unstarted|started|completed|cancelled`), color, sequence. These *are* the kanban columns and drive status mapping in reports.
3. **Work items** — sequence_id, name, description, state, priority (`urgent|high|medium|low|none`), assignees, target_date, completed_at, created/updated, labels.
4. **Members** — the workspace roster (we already have this in `users`; Plane membership is redundant once internal).
5. **Mutations** — create work item; patch state/priority/name/target_date (kanban drag = state patch).
6. **Status group semantics** — "completed" + `completed_at` within the week → accomplishment; pending groups → section 4. Reports depend entirely on the `group` field, not state names.

---

## 4. Schema Gap & Proposed Internal Model

The DB (`src/db/schema.ts`, Drizzle + `pg-core`/Supabase) has **no projects, states, or work-items tables today**. All ticketing entities must be added. Proposed:

```
projects
  id (serial pk), identifier (text uniq), name, description,
  created_at, updated_at, archived (int default 0)

project_states
  id (serial pk), project_id (fk projects), name,
  group (text: backlog|unstarted|started|completed|cancelled),
  color, sequence (int)

work_items
  id (serial pk), project_id (fk), sequence_id (int, per-project counter),
  name, description, priority (text default 'none'),
  state_id (fk project_states), target_date (text|null),
  completed_at (text|null), created_by (fk users),
  created_at, updated_at

work_item_assignees      ← many-to-many; replaces Plane's assignees[] + planeMemberId bridge
  work_item_id (fk), user_id (fk users)         [composite pk]

labels (optional, phase 2)
  id, project_id (fk), name, color
work_item_labels (optional)
  work_item_id (fk), label_id (fk)              [composite pk]
```

Notes:
- Keep `group` on states with the exact same vocabulary so report logic (`STATUS_MAP`, `PENDING_GROUPS`, `isCompletedGroup`) needs **zero changes** — only the data source swaps.
- `users.planeMemberId` → deprecate (keep nullable for one release, then drop migration).
- `sequence_id` needs a per-project counter (Plane auto-assigned this); a `projects.next_sequence` column or a `count(*)+1` on insert works.

---

## 5. Migration Plan (phased, low-risk)

### Phase 0 — Decide & freeze (0.5 day)
- Confirm no IC still relies on Plane's own UI for input (per stack-direction note, ICs move fully into this app).
- Snapshot/export current Plane projects, states, work items, assignees → JSON (one-time, via existing `src/lib/plane.ts` read functions in a throwaway script).

### Phase 1 — Schema + repository layer (1–2 days)
- Add tables in §4 to `src/db/schema.ts`; `npx drizzle-kit generate`; apply via Supabase SQL editor (per project convention — migrations are applied through Supabase, not `drizzle-kit migrate`).
- Build `src/lib/tickets.ts` exposing the **same function names/shapes** as `src/lib/plane.ts` (`getProjects`, `getProjectStates`, `getWorkItems`, `updateWorkItem`, `createWorkItem`, …) but backed by Drizzle queries. Matching the existing interface keeps page/route changes to a one-line import swap.

### Phase 2 — One-time data import (0.5 day)
- Script: read the Phase 0 snapshot → insert projects → states → work items → map Plane assignee IDs to `users.id` via the existing `planeMemberId` column (last use of that column).

### Phase 3 — Cut over reads (1 day)
- Swap imports `@/lib/plane` → `@/lib/tickets` in: dashboard, my-tasks, projects, projects/[id], weekly-report/plane-data, reports/generate, reports/members.
- Replace `session.planeMemberId` task filters with `session.id` joins on `work_item_assignees`.
- Delete the "Plane connection failed" error branches (now impossible) or repurpose as generic DB-error states.

### Phase 4 — Cut over writes (0.5 day)
- Reimplement `POST/PATCH /api/plane/work-items` against `src/lib/tickets.ts`. Kanban drag-drop already PATCHes `{ state }` — point it at the new state ids. Consider renaming the route to `/api/work-items` (keep an alias to avoid touching `kanban-board.tsx` fetch URL in the same PR).

### Phase 5 — Retire Plane + Python (0.5 day)
- Rewrite `/api/reports/history` and `/api/reports/download` to read from DB / a stored-reports table instead of `execFile` Python.
- Delete `report-script/` (or archive), `src/lib/plane.ts`, Plane env vars from both `.env.example` files.
- Update `CLAUDE.md`: remove "Plane.so (source of truth)" diagram, Plane env table, Python report-script section.
- Migration to drop `users.plane_member_id`.

---

## 6. Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| Data loss during one-time import (assignee mapping gaps) | High | Phase 0 snapshot is immutable; import is idempotent + dry-run first; verify counts vs snapshot |
| `sequence_id` collisions / gaps after import | Medium | Seed `projects.next_sequence` from `max(sequence_id)+1` per project |
| Report output differs from current Plane-backed reports | Medium | Keep `group` vocabulary identical; diff one user's report before/after on the same week |
| Half-migrated Python routes left shelling out | Medium | Phase 5 explicitly closes this; don't ship Phase 3 without scheduling Phase 5 |
| Hidden Plane-only fields (labels/blockers) used in reports | Low | Section-4 "Remarks" reads blocker labels — include labels tables in Phase 1 if reports must keep that column |
| `planeMemberId` referenced after drop | Low | grep for `planeMemberId` / `plane_member_id` before the drop migration |

---

## 7. Prioritized Action List

| Priority | Task | Effort |
|----------|------|--------|
| P0 | Phase 0 snapshot script (export Plane → JSON) | 0.5 d |
| P0 | Add internal ticketing tables to schema + Supabase migration | 1 d |
| P0 | `src/lib/tickets.ts` mirroring `src/lib/plane.ts` interface | 1 d |
| P1 | One-time import script (snapshot → DB, map assignees) | 0.5 d |
| P1 | Cut over read pages/routes (import swap + id-based filters) | 1 d |
| P1 | Cut over write route (`/api/plane/work-items` → DB) | 0.5 d |
| P2 | Rewrite reports/history + reports/download off Python | 0.5 d |
| P2 | Delete `report-script/`, `src/lib/plane.ts`, Plane env, update CLAUDE.md | 0.5 d |
| P3 | Drop `users.plane_member_id` migration | 15 min |

**Total: ~6 days.** Phases 1–4 are independently shippable behind the unchanged function interface; the app keeps working at every step.
