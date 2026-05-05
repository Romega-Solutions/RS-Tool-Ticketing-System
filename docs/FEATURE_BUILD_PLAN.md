# RS Ticketing System — Feature Build Plan & Agent Orchestration Guide

**Last updated:** 2026-05-05  
**Status:** Approved — ready to execute

---

## Overview

The RS Ticketing System is a **reporting and visibility layer on top of Plane.so** — not a replacement. ICs use Plane directly. This web app is for leads and admins to see real-time status, and for everyone to generate and download their weekly Excel reports.

Auth, layout, profile, and the Python report pipeline are complete. What remains is fixing two critical Python script bugs, building a TypeScript Plane API client, and finishing the three placeholder pages (Dashboard, My Tasks, Projects, Attendance).

---

## Feature Inventory

| Feature | File(s) | Status | Priority |
|---------|---------|--------|----------|
| Login page + auth API | `src/app/login/`, `src/app/api/auth/` | ✅ Complete | — |
| JWT session + middleware | `src/lib/auth.ts`, `src/proxy.ts` | ✅ Complete | — |
| RBAC (ic / lead / admin) | `src/lib/rbac.ts` | ✅ Complete | — |
| SQLite DB + users table | `src/db/schema.ts`, `src/db/index.ts` | ✅ Complete | — |
| Sidebar layout | `src/components/app-sidebar.tsx` | ✅ Complete | — |
| Profile page + API | `src/app/(app)/profile/`, `src/app/api/profile/` | ✅ Complete | — |
| Report generation (Python script) | `report-script/generate_report.py` | ⚠️ **2 critical bugs** | **P0** |
| Reports UI (generate + download) | `src/app/(app)/reports/` | ✅ Complete | — |
| TypeScript Plane client | `src/lib/plane.ts` | ❌ Missing | **P1** |
| `plane_member_id` in users table | `src/db/schema.ts` | ❌ Missing | **P1** |
| Dashboard — real Plane data | `src/app/(app)/dashboard/page.tsx` | ⚠️ Hardcoded | **P1** |
| My Tasks page | `src/app/(app)/my-tasks/page.tsx` | ❌ Placeholder | **P2** |
| Projects list page | `src/app/(app)/projects/page.tsx` | ❌ Missing | **P2** |
| Project board page | `src/app/(app)/projects/[id]/page.tsx` | ❌ Placeholder | **P2** |
| Attendance tracking | `src/app/(app)/attendance/page.tsx` | ❌ Placeholder | **P2** |
| Attendance API routes | `src/app/api/attendance/` | ❌ Missing | **P2** |

---

## Critical Bugs to Fix First (P0)

### Bug 1 — Deprecated `/issues/` endpoint
**File:** `report-script/generate_report.py` line 123  
Plane deprecated `/issues/` — support ended March 31, 2026. Must use `/work-items/`.

### Bug 2 — No pagination
**File:** `report-script/generate_report.py` line 123-126  
Single-request fetch truncates at 100 items. Projects with more tasks silently drop issues from reports.

---

## Dependency Chain

```
Agent A (Python fixes)
    ↓
Agent B (Foundation: Plane TS client + DB migration)
    ↓ ↓ ↓ ↓ (all parallel)
    C      D       E        F
Dashboard  MyTasks  Projects  Attendance
    ↓
npm run verify + smoke test
```

---

## Agent Definitions

### Orchestrator Agent
**Role:** Coordinates the build sequence. Dispatches subagents in order, validates output, re-runs on failure.

**Orchestrator prompt:**
```
You are the Orchestrator for the RS Ticketing System build. 
Run agents in this order:
1. Agent A (Python fixes) — then verify with `cd report-script && python generate_report.py --dry-run`
2. Agent B (Foundation) — then verify `npx tsc --noEmit` passes
3. Agents C, D, E, F in parallel — then `npm run verify` passes
Report status after each step. If an agent fails, re-run it with the error output included.
```

---

### Agent A — Python Script Fixes
**Scope:** `report-script/generate_report.py` only  
**No dependencies** — run first

**What to do:**
1. In `PlaneClient.get_issues()`, change the URL path from `/projects/{project_id}/issues/` to `/projects/{project_id}/work-items/`
2. Replace the single `_get()` call in `get_issues()` with a cursor-based pagination loop that collects all pages
3. Add rate-limit retry with exponential backoff to `PlaneClient._get()` — catch HTTP 429, sleep `2^attempt` seconds, retry up to 3 times
4. Add `import time` at the top of the file
5. In `filter_completed_this_week()`, remove the `or task.get("updated_at", "")` fallback — only filter on `completed_at`
6. In `report-script/.env.example`, add: `PLANE_PROJECT_SLUG=  # Optional: filter to one project by identifier`

**Verification:** `cd report-script && python generate_report.py --dry-run` — must print "Would connect..." without errors

---

### Agent B — Foundation
**Scope:** `src/lib/plane.ts` (new), `src/db/schema.ts`, DB migration  
**Depends on:** Agent A (so env var shape is confirmed)

**What to do:**

1. Create `src/lib/plane.ts` — server-only TypeScript Plane API client with:
   - `PlaneProject`, `PlaneState`, `PlaneMember`, `PlaneWorkItem` interfaces
   - `planeGet<T>()` — single fetch with `next: { revalidate: 60 }` cache
   - `planeGetAll<T>()` — cursor-loop fetching all pages
   - Exports: `getProjects()`, `getProjectStates(projectId)`, `getWorkspaceMembers()`, `getWorkItems(projectId, params?)`

2. Add to `src/db/schema.ts`:
   - `planeMemberId: text('plane_member_id')` column to the `users` table
   - New `attendance` table with columns: `id`, `userId`, `weekStart` (YYYY-MM-DD Monday), `mondayStatus` through `fridayStatus` (enum: present/absent/wfh/leave), `notes`, `submittedAt`, `createdAt`

3. Run `npx drizzle-kit generate && npx drizzle-kit migrate`

4. Update `src/app/api/profile/me/route.ts` GET to include `planeMemberId` in the response

**Verification:** `npx tsc --noEmit` — zero TypeScript errors

---

### Agent C — Dashboard (real Plane data)
**Scope:** `src/app/(app)/dashboard/page.tsx`  
**Depends on:** Agent B

**What to do:**

Convert to async server component. Replace ALL hardcoded mock data:

1. **Project cards row** — `getProjects()` → for each project call `getWorkItems(project.id)` → count tasks by `state_detail.group`. Show: total tasks, done count, in-progress count, blocked count (label "blocker"). Keep the same card UI.

2. **Friday report banner** — make dynamic: show only when `new Date().getDay() === 5`

3. **My Tasks snippet** — read session cookie → get `plane_member_id` from DB → `getWorkItems()` filtered by assignee → show first 3 active tasks

4. **Upcoming Deadlines** — collect all work items with `target_date` in next 14 days → sort by date → show top 4

5. **Team Workload bars** — `getWorkspaceMembers()` → for each member count open work items assigned → render bar (max = highest count or 15)

6. **Active Blockers** — work items across all projects where `label_detail` contains a label with "blocker" in the name

Session reading pattern (from `src/app/(app)/layout.tsx`):
```typescript
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
const cookieStore = await cookies();
const token = cookieStore.get('session_token')?.value;
const payload = token ? await verifyToken(token) : null;
```

**Verification:** Dev server shows real project names (not C1/C2/C3/C4 hardcoded), real task counts

---

### Agent D — My Tasks Page
**Scope:** `src/app/(app)/my-tasks/page.tsx`  
**Depends on:** Agent B

**What to do:**

Full page implementation with tab navigation.

Architecture: Server component fetches data, passes to a `'use client'` `TaskList` component that handles tab state.

**Data:** Read `plane_member_id` from session → `getWorkItems(projectId, { assignee: planeMemberId })` across all projects → group by state group:
- **Active tab:** `started`, `in_progress`, `in_review`
- **Backlog tab:** `backlog`, `unstarted`, `todo`
- **Completed tab:** `completed` — filter to last 30 days by `completed_at`

**Task card UI:**
- Title (bold)
- Project name (muted, small) — pass project name alongside each work item
- Priority badge: urgent=red, high=orange, medium=yellow, low=green, none=gray
- Due date chip (orange if overdue)
- State pill

**Tab switcher:** Three buttons at the top, border-bottom active indicator (same style as RS primary color)

If `plane_member_id` is null (not set), show a callout: "Your Plane account isn't linked yet. Ask your admin to set your Plane Member ID in your profile."

**Verification:** Login as IC → `/my-tasks` shows real task data, tab switching works

---

### Agent E — Projects List + Board
**Scope:** `src/app/(app)/projects/page.tsx` (new), `src/app/(app)/projects/[id]/page.tsx`, `src/components/app-sidebar.tsx`  
**Depends on:** Agent B

**What to do:**

1. **Projects list page** (`src/app/(app)/projects/page.tsx` — new file):
   - `getProjects()` → render cards in a grid
   - Each card: identifier badge (e.g. "C1"), project name, open task count
   - Card links to `/projects/[project.id]`

2. **Project board** (`src/app/(app)/projects/[id]/page.tsx`):
   - Fetch `getProjectStates(id)` and `getWorkItems(id)` in parallel with `Promise.all`
   - Group work items by `state` UUID
   - Render horizontal Kanban: each column = one state, colored header matching `state.color`
   - Work item cards: `#{sequence_id}` number, title, priority icon, assignee initials (circle), due date
   - Read-only (no drag-drop — Plane is source of truth)

3. **Sidebar update** (`src/components/app-sidebar.tsx`):
   - Replace the hardcoded C1–C4 project links with a single "Projects" nav item linking to `/projects`
   - Keep the same icon and styling pattern used by other nav items
   - Update `src/lib/rbac.ts` `canAccessPath()` if needed to allow `/projects` for all roles

**Verification:** `/projects` lists real Plane projects; clicking one shows a real Kanban board with real columns and cards

---

### Agent F — Attendance Tracking
**Scope:** `src/app/(app)/attendance/page.tsx`, `src/app/api/attendance/route.ts` (new), `src/db/schema.ts` (already updated by Agent B)  
**Depends on:** Agent B (attendance table already created)

**What to do:**

1. **API routes** — `src/app/api/attendance/route.ts`:
   - `GET ?week=YYYY-MM-DD` — returns attendance records for that week. IC: own record only. Lead/admin: all users' records.
   - `POST { weekStart, mon, tue, wed, thu, fri, notes }` — create/upsert IC's own record for the week
   - Validate `weekStart` is a Monday. Validate status values are one of: `present`, `absent`, `wfh`, `leave`, `''`.

2. **Attendance page** (`src/app/(app)/attendance/page.tsx`):
   - Week navigator: `< Prev Week` | `Mon May 5 – Fri May 9` | `Next Week >`
   - **IC view:** Single row grid (Mon–Fri). Each cell = select/button to set status. "Save" button calls `POST /api/attendance`. Shows own submitted record.
   - **Lead/admin view:** Table where rows = team members (from DB users), columns = Mon–Fri. Each cell shows the member's submitted status as a colored badge. Read-only aggregate. "Export CSV" button.
   - Status badge colors: present=green, wfh=blue, leave=yellow, absent=red, (empty)=gray

**Verification:** IC can submit attendance, lead/admin sees team grid

---

## Execution Order (step-by-step)

```bash
# 1. Agent A — Python fixes
#    Fix generate_report.py, test with dry-run
cd report-script && python generate_report.py --dry-run

# 2. Agent B — Foundation
#    Create src/lib/plane.ts, update schema, run migration
npx drizzle-kit generate && npx drizzle-kit migrate
npx tsc --noEmit  # must pass

# 3. Agents C + D + E + F — run in parallel (each in its own Claude session)
#    These only read from Plane, safe to run simultaneously

# 4. Final verification
npm run verify     # lint + build must pass
npm run dev        # smoke test all pages
```

---

## Environment Variables Required

Add to root `.env` (Next.js):
```env
PLANE_BASE_URL=https://romega-projects-rs-plane.ikuuwb.easypanel.host
PLANE_API_KEY=plane_api_xxxxxxxxxxxxxxxxxxxxxxxx
PLANE_WORKSPACE_SLUG=romega
JWT_SECRET=<strong-random-secret>
REPORT_SCRIPT_DIR=/absolute/path/to/report-script
```

Add to `report-script/.env`:
```env
PLANE_BASE_URL=https://romega-projects-rs-plane.ikuuwb.easypanel.host
PLANE_API_KEY=plane_api_xxxxxxxxxxxxxxxxxxxxxxxx
PLANE_WORKSPACE_SLUG=romega
PLANE_PROJECT_SLUG=   # optional: filter to one project
REPORT_OUTPUT_DIR=./reports
```

---

## Verification Checklist

After all agents complete:

- [ ] `npm run verify` passes (zero lint errors, clean build)
- [ ] Login as `ken` (IC) → lands on `/my-tasks`
- [ ] `/my-tasks` shows real Plane tasks for Ken, tabs work
- [ ] Login as `mark` (lead) → lands on `/dashboard`
- [ ] `/dashboard` project cards show real project names (not C1–C4 hardcoded)
- [ ] `/dashboard` task counts are real numbers from Plane
- [ ] `/projects` lists real Plane projects
- [ ] `/projects/[id]` shows Kanban board with real columns + cards
- [ ] `/attendance` renders grid, IC can submit status, lead sees team grid
- [ ] `/reports` → Generate Report button still works
- [ ] `python generate_report.py --dry-run` exits cleanly (no import errors)
- [ ] Report generated for ken has correct tasks (no missing due to pagination)
