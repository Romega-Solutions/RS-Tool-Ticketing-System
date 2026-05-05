# RS Ticketing System — Plane Capabilities & Feature Roadmap

**Date:** 2026-05-05  
**Author:** Ken Garcia / Claude Code

---

## TL;DR

The RS Ticketing System is currently a **read-only reporting layer** on top of Plane.so. The Plane REST API supports full CRUD — meaning the website can eventually do everything Plane's own UI does: create tasks, drag-and-drop Kanban cards, manage projects, assign members, set due dates, and more. This document maps what's already working, what the API can do, and a phased roadmap to turn this into the **primary UI for IC users**.

---

## 1. What Works Today (Production-Ready)

| Feature | Who Can Use | Notes |
|---------|-------------|-------|
| Login / logout | Everyone | JWT, HTTP-only cookie, 7-day session |
| Role-based access | Everyone | `ic` / `lead` / `admin` roles enforced |
| Profile page | Everyone | View name, email, role, team, job title |
| Weekly report generation | Lead, Admin | Shells out to Python → produces `.xlsx` |
| Report download | Lead, Admin | Downloads generated Excel file |
| Report history | Lead, Admin | Lists previously generated reports |
| Sidebar navigation | Everyone | Collapses, mobile sheet nav |
| Attendance page | Lead, Admin | UI shell exists — data layer not yet wired |

**What's not wired yet:** Dashboard, My Tasks, Projects board, and Attendance all show placeholder/hardcoded data. None of them hit the real Plane API yet.

---

## 2. What the Plane API Can Do (Full Capability Map)

These are all documented, working endpoints on the self-hosted Plane instance at Romega. Everything below can be surfaced in this website's UI.

### 2.1 Projects

| Action | API Method | UI Equivalent |
|--------|-----------|---------------|
| List all projects | `GET /projects/` | Projects list page |
| Get one project | `GET /projects/{id}/` | Project detail header |
| Create a project | `POST /projects/` | "New Project" form |
| Update project (name, description) | `PATCH /projects/{id}/` | Edit project settings |
| Delete project | `DELETE /projects/{id}/` | Admin: delete project |
| List project members | `GET /projects/{id}/members/` | Project team roster |

### 2.2 Work Items (Tasks)

| Action | API Method | UI Equivalent |
|--------|-----------|---------------|
| List all tasks in a project | `GET /projects/{id}/work-items/` | Kanban board / task list |
| Filter by assignee | `?assignee={member_id}` | My Tasks page |
| Filter by state | `?state={state_id}` | Kanban column |
| Filter by priority | `?priority=urgent` | Priority filter |
| Get single task | `GET /projects/{id}/work-items/{item_id}/` | Task detail modal |
| **Create a task** | `POST /projects/{id}/work-items/` | "Add Task" button |
| **Update task state** | `PATCH /projects/{id}/work-items/{item_id}/` | **Drag-and-drop Kanban** |
| **Update task priority** | `PATCH /projects/{id}/work-items/{item_id}/` | Priority dropdown |
| **Update task assignee** | `PATCH /projects/{id}/work-items/{item_id}/` | Assignee picker |
| **Update due date** | `PATCH /projects/{id}/work-items/{item_id}/` | Date picker |
| **Update title/description** | `PATCH /projects/{id}/work-items/{item_id}/` | Inline edit |
| Delete a task | `DELETE /projects/{id}/work-items/{item_id}/` | Admin: delete task |
| List task comments | `GET /projects/{id}/work-items/{item_id}/comments/` | Task comment thread |
| Add a comment | `POST /projects/{id}/work-items/{item_id}/comments/` | Comment box |
| List sub-issues | `GET /projects/{id}/work-items/?parent={item_id}` | Sub-task list |

> **Drag-and-drop = one PATCH call.** Moving a Kanban card from "In Progress" to "Done" is just `PATCH /work-items/{id}/ { "state": "{done_state_id}" }`. This is fully supported.

### 2.3 States (Kanban Columns)

| Action | API Method | UI Equivalent |
|--------|-----------|---------------|
| List states for a project | `GET /projects/{id}/states/` | Kanban column headers |
| Create a state | `POST /projects/{id}/states/` | "Add column" |
| Update state (name, color, order) | `PATCH /projects/{id}/states/{state_id}/` | Column settings |
| Delete a state | `DELETE /projects/{id}/states/{state_id}/` | Remove column |

### 2.4 Members & Users

| Action | API Method | UI Equivalent |
|--------|-----------|---------------|
| List workspace members | `GET /members/` | Team workload view, assignee pickers |
| Get member detail | `GET /members/{member_id}/` | Member profile card |
| List project members | `GET /projects/{id}/members/` | Project team tab |
| Invite member to project | `POST /projects/{id}/members/` | Admin: add to project |

### 2.5 Labels

| Action | API Method | UI Equivalent |
|--------|-----------|---------------|
| List labels | `GET /projects/{id}/labels/` | Label filter chips |
| Create label | `POST /projects/{id}/labels/` | Label management |
| Apply label to task | `PATCH /work-items/{id}/ { "label_ids": [...] }` | Label picker on task |

### 2.6 Cycles (Sprints)

| Action | API Method | UI Equivalent |
|--------|-----------|---------------|
| List cycles | `GET /projects/{id}/cycles/` | Sprint selector |
| Get cycle issues | `GET /projects/{id}/cycles/{id}/cycle-issues/` | Sprint board |
| Create cycle | `POST /projects/{id}/cycles/` | "New Sprint" form |

### 2.7 Modules (Epics / Feature Groups)

| Action | API Method | UI Equivalent |
|--------|-----------|---------------|
| List modules | `GET /projects/{id}/modules/` | Module/epic dropdown |
| Get module issues | `GET /projects/{id}/modules/{id}/module-issues/` | Module task list |

---

## 3. Current Limitations (Before Going to Production)

### Critical (must fix before shipping)

| # | Issue | Fix |
|---|-------|-----|
| 1 | Python script calls deprecated `/issues/` endpoint (dead since March 31, 2026) | Change to `/work-items/` in `generate_report.py` |
| 2 | Report generation only fetches first 100 tasks — silently drops the rest | Add cursor-based pagination loop |
| 3 | No Plane API client in Next.js — dashboard/my-tasks/projects all show fake data | Build `src/lib/plane.ts` |

### High (fix soon after)

| # | Issue | Fix |
|---|-------|-----|
| 4 | No user-to-Plane-member identity bridge | Add `plane_member_id` column to `users` table |
| 5 | Reports saved to local disk — lost on server restart | Use a persistent volume or cloud storage |
| 6 | No rate-limit handling — API calls fail silently at 60 req/min | Add retry with exponential backoff |

---

## 4. Roadmap — Phases

### Phase 1 — Fix & Ship (Current: this week)
*Goal: production-safe with working reports and real data in pages.*

- [x] Auth, RBAC, sidebar, profile, reports UI
- [ ] Fix deprecated `/issues/` → `/work-items/` in Python script
- [ ] Add pagination to Python script
- [ ] Build TypeScript `PlaneClient` in `src/lib/plane.ts`
- [ ] Wire real Plane data to Dashboard, My Tasks, Projects board
- [ ] Add `plane_member_id` to users table

**After Phase 1:** System is live, leads/admins can see real data and generate reports. ICs can view their own tasks. All read-only.

---

### Phase 2 — IC Write Access (1–2 weeks after Phase 1)
*Goal: ICs can use this website instead of opening Plane directly for common actions.*

| Feature | What it does | Plane API used |
|---------|-------------|----------------|
| **Move task on Kanban** | Drag card to different column | `PATCH /work-items/{id}/ { state }` |
| **Update task priority** | Change urgent/high/medium/low | `PATCH /work-items/{id}/ { priority }` |
| **Set/change due date** | Pick date on a task | `PATCH /work-items/{id}/ { target_date }` |
| **Add task comment** | Comment on a task | `POST /work-items/{id}/comments/` |
| **Create a new task** | "Add task" in a project board | `POST /projects/{id}/work-items/` |
| **Mark task complete** | Click "Done" button | `PATCH /work-items/{id}/ { state: done_state_id }` |
| **View task detail** | Full task modal with description, comments, history | `GET /work-items/{id}/` + comments |

**RBAC for Phase 2 (IC permissions):**

```
ic:
  can read: all projects they're a member of, their own tasks
  can write: task state (own tasks only), task comments, task due date
  cannot: create projects, delete tasks, see other users' reports
```

---

### Phase 3 — Lead/Admin Write Access (2–4 weeks after Phase 2)
*Goal: Leads manage projects, sprints, and team assignments without leaving this site.*

| Feature | Who | Plane API used |
|---------|-----|----------------|
| **Create project** | Admin | `POST /projects/` |
| **Create task** | Lead, Admin | `POST /projects/{id}/work-items/` |
| **Assign task to team member** | Lead, Admin | `PATCH /work-items/{id}/ { assignees }` |
| **Create Kanban state/column** | Lead, Admin | `POST /projects/{id}/states/` |
| **Manage sprint (cycle)** | Lead, Admin | `POST/PATCH /projects/{id}/cycles/` |
| **Add member to project** | Admin | `POST /projects/{id}/members/` |
| **Manage labels** | Lead, Admin | `POST /projects/{id}/labels/` |
| **Bulk update tasks** | Lead, Admin | Multiple `PATCH` calls |
| **Delete task** | Admin | `DELETE /projects/{id}/work-items/{id}/` |

**RBAC for Phase 3:**

```
lead:
  can read: all projects, all team tasks, reports, attendance
  can write: task state/priority/assignee/date in own projects, comments
  can create: tasks in own projects, sprints
  cannot: create/delete projects, manage users, manage other leads' projects

admin:
  can do: everything, including create projects, manage users, delete anything
```

---

### Phase 4 — IC as Primary UI (optional, future)
*Goal: ICs never need to open Plane directly. This site is their full work interface.*

Additional features needed:

| Feature | Complexity |
|---------|-----------|
| Drag-and-drop Kanban (using `@dnd-kit` or `react-beautiful-dnd`) | Medium |
| Rich text task descriptions (Tiptap editor) | Medium |
| File attachments on tasks | High |
| Real-time updates (Plane webhooks → SSE push to browser) | High |
| Task search across all projects | Medium |
| Notification bell for assigned/mentioned tasks | High |
| Mobile-optimized task view | Low (already responsive) |
| Offline support / PWA | High |

---

## 5. What Drag-and-Drop Actually Looks Like

This is feasible in Phase 2. Here's the full data flow:

```
User drags "Fix login bug" card
  from "In Progress" column
  to "Done" column

  → client calls: PATCH /api/plane/work-items/{id}
  → Next.js API route calls: Plane PATCH /projects/{proj_id}/work-items/{id}/
      body: { "state": "done-state-uuid" }
  → Plane updates the record
  → Response 200 → card animates to new column
  → Optimistic UI update (card moves immediately, reverts on error)
```

The only hard part is maintaining the `state_id ↔ column` mapping in the UI. States are fetched fresh via `getProjectStates()` on each board load so they're always accurate.

---

## 6. Quick Summary for Production Decision

**What's in production-ready state right now:**
- Auth, RBAC, sidebar, profile, report generation (once Python bugs are patched), report download

**What still shows fake/hardcoded data:**
- Dashboard, My Tasks, Projects board, Attendance

**Minimum viable production:**
Fix the two Python script bugs (30–60 min), deploy. Reports will work. Pages will show placeholders but that's visible only to logged-in users and is clearly marked as "coming soon" territory.

**Full live-data production:**
Build the TypeScript Plane client and wire the three pages (~3–4 days of work).

**IC self-service UI:**
Add write operations in Phase 2 (~1–2 weeks after live data is wired).
