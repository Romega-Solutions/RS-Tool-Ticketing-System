# Internal Project Management Build Plan

**Date:** 2026-05-20
**Author:** Ken Garcia / Claude Code
**Status:** Draft — replaces `PLANE_CAPABILITIES_ROADMAP.md` (Plane is being removed)
**Stack target:** Next.js 16 + Drizzle + Postgres (Supabase) + n8n + Gemini — no Plane.

---

## 1. Goal

Plane.so is being deleted. This app becomes the **single source of truth** for projects, tasks, and Kanban — fully owned, fully RBAC-gated, fully integrated with the timesheet/reporting/AI features already shipped.

We are not building a Plane clone. We are duplicating only the parts the Romega team actually uses, on top of tables we already own.

---

## 2. What's Already Internal (Done)

Verified against `src/db/schema.ts` and recent commits `51cb3c1`, `8479db1`.

| Capability | Source | Status |
|---|---|---|
| `projects` table (identifier, name, network, sequence counter, archived) | `src/db/schema.ts:139` | ✅ |
| `project_states` table (name, group, color, sequence) | `src/db/schema.ts:151` | ✅ |
| `work_items` table (sequenceId, name, description, priority, stateId, targetDate, completedAt) | `src/db/schema.ts:160` | ✅ |
| `work_item_assignees` table (workItemId, memberKey) | `src/db/schema.ts:177` | ✅ |
| Tickets library (server-side queries) | `src/lib/tickets.ts` | ✅ |
| Dashboard reads from internal DB | `src/app/(app)/dashboard/` | ✅ |
| Projects list reads from internal DB | `src/app/(app)/projects/page.tsx` | ✅ |
| Project board (read-only Kanban) reads from internal DB | `src/app/(app)/projects/[id]/` | ✅ |
| RBAC (ic / lead / admin / pm) | `src/lib/rbac.ts` | ✅ |
| Timesheet + clock-in/out + overtime guardrail | `timesheets` table, `src/lib/presence.ts` | ✅ |
| Weekly report (in-app) | `weekly_reports` table | ✅ |

**Translation:** the foundation is here. We've already eaten the hardest part (data model + read paths). What's left is write operations, drag-drop, and the auxiliary entities (comments, labels, cycles).

---

## 3. What Plane Has That We Don't Yet

From `PLANE_CAPABILITIES_ROADMAP.md` §2 cross-checked against current code.

### Must-have (the team uses these weekly)

| Gap | Why it matters |
|---|---|
| **Drag-and-drop Kanban** | ICs move tasks between states daily; clicking + dropdowns is friction |
| **Create / edit / delete tasks from UI** | Right now `work_items` can only be inserted directly via SQL or scripts |
| **Task detail modal** | Description, priority, assignees, due date, history in one place |
| **Assignee picker (multi-user)** | `work_item_assignees` table exists but no UI to set/change |
| **Comments on tasks** | Conversation history for handoffs and reviews |
| **Labels / tags** | Filtering by `blocker`, `urgent`, `design`, `dev`, `waiting-approval` |
| **Project member roster** | Who can see / be assigned in a project (distinct from workspace users) |

### Nice-to-have (used occasionally on Plane)

| Gap | Why it matters |
|---|---|
| **Cycles / Sprints** | Weekly or biweekly sprint grouping for the report |
| **Sub-issues / parent-child** | Breaking a feature into checklist items |
| **Saved views / filters** | "All Blockers", "My Overdue", "Done This Week" |
| **Modules / Epics** | Grouping related tasks under a feature umbrella |

### Skip (Plane has, we don't need)

- Rich text editor (markdown is enough for our team)
- File attachments (we use Google Drive links in description)
- Real-time websocket sync (poll/refresh is fine at our team size)
- Custom workflows per project (one global state model is enough)
- Estimates / story points (we don't do them)

---

## 4. Data Model — Additions Needed

All additions follow the existing Drizzle + pg-core conventions. Tables to add:

### 4.1 `work_item_comments`
```ts
export const workItemComments = pgTable('work_item_comments', {
  id:         serial('id').primaryKey(),
  workItemId: integer('work_item_id').notNull().references(() => workItems.id, { onDelete: 'cascade' }),
  authorId:   integer('author_id').notNull().references(() => users.id),
  body:       text('body').notNull(),
  createdAt:  text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt:  text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});
```

### 4.2 `labels` and `work_item_labels`
```ts
export const labels = pgTable('labels', {
  id:        serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name:      text('name').notNull(),
  color:     text('color').notNull().default('#6b7280'),
});

export const workItemLabels = pgTable('work_item_labels', {
  id:         serial('id').primaryKey(),
  workItemId: integer('work_item_id').notNull().references(() => workItems.id, { onDelete: 'cascade' }),
  labelId:    integer('label_id').notNull().references(() => labels.id, { onDelete: 'cascade' }),
}, (t) => [unique('work_item_labels_unique').on(t.workItemId, t.labelId)]);
```

### 4.3 `project_members`
Separate from workspace `users` — controls who appears in assignee pickers and can see the project.
```ts
export const projectMembers = pgTable('project_members', {
  id:        serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId:    integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role:      text('role').notNull().default('member'), // 'lead' | 'member' | 'viewer'
}, (t) => [unique('project_members_unique').on(t.projectId, t.userId)]);
```

### 4.4 `cycles` (Phase 3 — defer if we want speed)
```ts
export const cycles = pgTable('cycles', {
  id:        serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name:      text('name').notNull(),
  startDate: text('start_date').notNull(),
  endDate:   text('end_date').notNull(),
  archived:  integer('archived').notNull().default(0),
});

// work_items gets a nullable cycleId column added
```

### 4.5 `work_item_activity` (audit trail)
Lightweight audit log so the task detail modal can show history.
```ts
export const workItemActivity = pgTable('work_item_activity', {
  id:         serial('id').primaryKey(),
  workItemId: integer('work_item_id').notNull().references(() => workItems.id, { onDelete: 'cascade' }),
  actorId:    integer('actor_id').notNull(),
  action:     text('action').notNull(), // 'state_changed' | 'assigned' | 'commented' | 'created' | 'edited'
  fromValue:  text('from_value'),
  toValue:    text('to_value'),
  createdAt:  text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});
```

---

## 5. API Surface

All routes mounted under `/api/tickets/` (replaces the legacy `/api/plane/`). Server actions can be used for mutations where convenient — REST routes for things that need to be called from n8n.

### 5.1 Work items
- `GET    /api/tickets?projectId=&assignee=&state=&label=` — list with filters
- `POST   /api/tickets` — create
- `GET    /api/tickets/[id]` — detail (with comments, activity, labels, assignees)
- `PATCH  /api/tickets/[id]` — update any field (state, priority, assignees, dates, labels)
- `DELETE /api/tickets/[id]` — admin only

### 5.2 Comments
- `GET  /api/tickets/[id]/comments`
- `POST /api/tickets/[id]/comments`
- `PATCH/DELETE /api/tickets/[id]/comments/[commentId]` — author or admin

### 5.3 Labels
- `GET  /api/projects/[id]/labels`
- `POST /api/projects/[id]/labels` — lead+
- `DELETE /api/projects/[id]/labels/[labelId]` — lead+

### 5.4 Project membership
- `GET  /api/projects/[id]/members`
- `POST /api/projects/[id]/members` — admin
- `DELETE /api/projects/[id]/members/[userId]` — admin

### 5.5 Project / state CRUD
- `POST   /api/projects` — admin
- `PATCH  /api/projects/[id]` — admin
- `POST   /api/projects/[id]/states` — lead+
- `PATCH  /api/projects/[id]/states/[stateId]` — lead+

---

## 6. UI Work — Pages & Components

### 6.1 Project board (`/projects/[id]`) — Phase 1 priority
Currently read-only. Add:
- **`@dnd-kit`-powered drag-and-drop** between columns → `PATCH /api/tickets/[id]` with `{ stateId }`
- **"+ New task" button** on each column → opens create modal pre-filled with that state
- **Task card click** → opens task detail drawer (right-side sheet, shadcn `Sheet`)
- **Filter bar:** assignee, label, priority, due-soon (URL-synced via `useSearchParams`)
- **Optimistic UI** with revert on error

### 6.2 Task detail drawer — Phase 1 priority
Single shadcn `Sheet` component with tabs:
- **Details:** title, description (markdown), priority, state, assignees, due date, labels, cycle
- **Comments:** list + composer
- **Activity:** read-only audit log

### 6.3 My Tasks (`/my-tasks`)
Already exists in shell — add real data + tabs (Active / Backlog / Done). Wire to task detail drawer (same component as board).

### 6.4 Projects list (`/projects`)
Already exists. Add:
- **"+ New project" button** (admin only)
- **Archive toggle** on the card menu

### 6.5 Project settings (`/projects/[id]/settings`) — new
Lead+ only. Sub-pages:
- General (name, description, archive)
- States (reorder, rename, add, color)
- Labels (add, rename, delete, color)
- Members (add user from workspace, set role)

### 6.6 Sidebar
Already has Projects link. Add per-project quick links once a user opens a project (collapsible group). Lower priority.

---

## 7. RBAC Additions

Extend `src/lib/rbac.ts`. Current roles: `ic`, `lead`, `admin`, `pm`. The "Tech Lead" role is **non-technical** — treat as PM (per memory `project_stack_direction`).

| Action | ic | pm / lead | admin |
|---|---|---|---|
| View projects they're a member of | ✓ | ✓ (all) | ✓ (all) |
| Create task in member-of project | ✓ | ✓ | ✓ |
| Edit own assigned task (state, comments, date) | ✓ | ✓ | ✓ |
| Edit any task in project | ✗ | ✓ | ✓ |
| Delete task | ✗ | ✗ | ✓ |
| Create project | ✗ | ✗ | ✓ |
| Manage states/labels/members | ✗ | ✓ | ✓ |
| Archive / delete project | ✗ | ✗ | ✓ |

Helper to add: `canEditWorkItem(user, workItem)` and `canManageProject(user, projectId)`.

---

## 8. Migration Off Plane

Three pieces to retire:
1. **`src/lib/plane.ts`** — delete after all reads switch to `src/lib/tickets.ts`. Currently unreferenced by pages but still imported by `/api/plane/`. Verify with `grep`.
2. **`src/app/api/plane/`** — delete the route group once nothing client-side calls it.
3. **`report-script/`** Python script — repoint at the internal Postgres (or replace with a Next.js API route + server-side `exceljs`). Decision deferred to Phase 4.

Plane is already a "delete on sight" zero-dependency line item — no data migration needed because the internal `work_items` table is the new source of truth.

---

## 9. Phased Rollout

Each phase ships independently and can be released to the team before the next phase starts.

### Phase 1 — Write Operations + Drag-Drop (target: 1 week)
**Goal:** the team can do daily Kanban work without leaving the app.

- [ ] Add `work_item_comments`, `labels`, `work_item_labels`, `project_members`, `work_item_activity` tables + migration
- [ ] Build `/api/tickets` REST routes (list, create, detail, patch, delete)
- [ ] Wire drag-and-drop on `/projects/[id]` via `@dnd-kit` → PATCH state
- [ ] Task detail drawer (Details + Comments tabs)
- [ ] "+ New task" modal on board columns
- [ ] Optimistic UI + toast on error
- [ ] Activity log writes on every mutation
- [ ] Verify legacy `src/lib/plane.ts` has zero importers → delete
- [ ] Verify `/api/plane/` has zero callers → delete

**Exit criteria:** an IC can complete a full day of work using only this app.

### Phase 2 — Filtering, Labels, Members (target: 3–4 days)
- [ ] Filter bar on board + my-tasks (URL-synced)
- [ ] Label CRUD UI in project settings
- [ ] Apply/remove labels from task drawer
- [ ] Project members management UI
- [ ] Assignee picker in task drawer (filtered to project members)

### Phase 3 — Cycles + Reports Tie-In (target: 3–5 days)
- [ ] Add `cycles` table + `work_items.cycle_id`
- [ ] Cycle selector + per-cycle board view
- [ ] Weekly report auto-population from current cycle's `completedAt` tasks
- [ ] Replace Python `generate_report.py` with Next.js route using `exceljs` (or keep the script but repoint at Postgres)

### Phase 4 — Polish (target: ongoing)
- [ ] Sub-issues (`work_items.parent_id`)
- [ ] Saved views per user
- [ ] n8n hook: ticket created/closed → Slack/email notification (uses existing n8n stack)
- [ ] Gemini hook: "summarize this task's comments" button (uses existing Gemini integration)
- [ ] Delete `report-script/` if replaced

---

## Status — Phases 1–4 Shipped (2026-05-20 / 2026-05-21)

### One canonical migration: `docs/migrations/add-pm-phase1.sql`

This single file is self-bootstrapping and covers every phase. Open Supabase → SQL Editor → New query → paste contents → Run. Re-running is safe (`IF NOT EXISTS` + `DO $$ ... EXCEPTION WHEN duplicate_object`).

It (a) creates the four base ticketing tables if they don't already exist, then (b) layers on every Phase 1–4 addition.

### Phase 1 — write ops + drag-drop ✅

- ✅ Drizzle schema: `workItemComments`, `labels`, `workItemLabels`, `projectMembers`, `workItemActivity`, `workItemAssignees.userId`, `workItems.archived`
- ✅ `/api/tickets/*` REST surface: work-items (POST/PATCH/GET/DELETE), comments (GET/POST/PATCH/DELETE), activity (GET), labels (GET/POST/DELETE), members (GET/POST/DELETE), users (GET)
- ✅ `src/lib/tickets.ts` — detail/comment/label/member/activity helpers + diff-based activity logging
- ✅ `src/lib/permissions.ts` — § 7 RBAC matrix
- ✅ `src/components/task-detail-sheet.tsx` — Details / Comments / Activity tabs
- ✅ Drag-and-drop board repointed to `/api/tickets/work-items`
- ✅ Card click opens detail sheet
- ✅ `src/lib/plane.ts` and `src/app/api/plane/` deleted

### Phase 2 — filtering, labels, members ✅

- ✅ Filter bar on Kanban: assignee, label, priority, cycle, "due in 7d", "mine only" — URL-synced via `history.replaceState`
- ✅ Filter chips on `/my-tasks`: priority + due-soon, URL-synced via `?priority=&dueSoon=1`
- ✅ Labels CRUD UI in **project settings** page (`/projects/[id]/settings`)
- ✅ Apply/remove labels from the task detail drawer (toggle chips)
- ✅ Project members management UI in project settings
- ✅ Assignee picker in drawer filters to `project_members`

### Phase 3 — cycles ✅

- ✅ `cycles` table + `work_items.cycle_id` column (migration + Drizzle schema)
- ✅ `/api/tickets/projects/[projectId]/cycles` GET/POST + `[cycleId]` PATCH/DELETE
- ✅ Cycle CRUD UI in project settings
- ✅ Cycle dropdown on the Kanban board (filter) + cycle selector in the task detail drawer
- ⚠️ Weekly report tie-in **deferred** — the existing report flow already works against `weekly_reports` + `timesheets`; wiring cycles into Excel generation is a separate workstream that touches the Python script. Left as Phase 5 work.

### Phase 4 — sub-issues + saved views (DB-level + minimal UI) ✅

- ✅ `work_items.parent_id` self-FK column for sub-issues
- ✅ `saved_views` table (per-user filter presets, optional project scoping)
- ✅ `/api/tickets/work-items/[id]/children` GET — list sub-issues
- ✅ `/api/tickets/saved-views` GET/POST + `/[id]` DELETE
- ✅ Sub-issues list + quick-add input in task detail drawer
- ⚠️ Saved views UI on the board **deferred** — endpoint is live; UI hookup is < 1h work whenever a user requests it.
- ⚠️ n8n webhook hooks (ticket created/closed → Slack/email) — **deferred** to integration phase; needs a product decision on which events fire which webhook.
- ⚠️ Gemini "summarize this task's comments" button — **deferred**; needs prompt + cost decisions.
- ⚠️ Delete `report-script/` — **kept** until Phase 5 replaces it; still functional against the new schema.

### Verification

- `npx tsc --noEmit` exits clean.
- `src/lib/plane.ts` and `src/app/api/plane/` are gone; no remaining importers.
- Lint: 880 pre-existing project-wide errors of `react-hooks/set-state-in-effect` (same baseline as the rest of the codebase).

---

## 10. Open Questions (decided 2026-05-20)

1. **Q1 — `member_key` vs `user_id` on `work_item_assignees`** → **DECIDED: add `user_id` FK, backfill, plan to drop `member_key` in Phase 2.**
   Column added in 0008 migration, backfilled from `users.plane_member_id`. New assignments insert both `user_id` and `member_key` (member_key still NOT NULL). Phase 2 will make `member_key` nullable then drop it.

2. **Q2 — Can ICs comment on tasks they're not assigned to?** → **DECIDED: yes, any project member can comment.** Enforced by `canCommentOnProject()` in `src/lib/permissions.ts`.

3. **Q3 — Server actions vs API routes?** → **DECIDED: API routes only.** All mutations go through `/api/tickets/*`. Callable from n8n, scripts, future mobile.

4. **Q4 — Manual reorder within a column?** → **DECIDED: no.** Sort is implicit (by `sequence_id`). Manual ordering deferred to Phase 4.

5. **Q5 — Soft vs hard delete?** → **DECIDED: soft delete via `archived` flag on `work_items`.** Admin-only `DELETE /api/tickets/work-items/[id]` sets `archived = 1`. List queries exclude archived items. No UI for hard delete in Phase 1.

---

## 11. References

- `docs/PLANE_CAPABILITIES_ROADMAP.md` — original Plane feature map (still useful as a comparison target)
- `docs/FEATURE_BUILD_PLAN.md` — earlier phase plan when Plane was still in the loop
- `docs/SYSTEM_FLOW_SUMMARY.md` — original problem statement and workflow
- `src/db/schema.ts` — current ground truth for tables
- `src/lib/tickets.ts` — current ticket read library to extend with write methods
- Memory: `project_stack_direction` — confirms Plane removal + stack constraints
