# RS Ticketing System — Feature Breakdown

> **Note:** This doc describes the **custom build path (Option A)**. The current approach is **Option B (Plane.so + report script)** — see `feasibility.md`. Retained as reference if the team decides to build custom later.

## MVP (Build First)

### 1. User Authentication
Multi-user login with database-backed accounts. Three roles: Admin, Manager, IC. Password hashing (bcrypt) with session tokens (JWT in HTTP-only cookies). Admin creates accounts — no self-registration.

**Why:** Multiple people use the same system. The Certificate Creator's fake localStorage auth won't work here.

### 2. Project Management
CRUD for projects mapped to the existing C1-C4 structure. Each project has: code, name, description, status (active/on-hold/completed/archived), project lead.

**Why:** Mirrors the current `RS - General/C1-C4` folder structure. Provides the top-level grouping for all tasks.

### 3. Task Management
Tasks with: title, description (markdown), assignee, priority (High/Medium/Low), status, due date, project, tags, subtasks. Activity log tracks all changes (who changed what, when).

**Statuses:** Backlog → To Do → In Progress → In Review → Done / Cancelled

**Priorities:** High (red), Medium (yellow), Low (green) — maps directly to existing 🔴🟡🟢 emoji convention in markdown TODOs.

**Key decision:** Only title + project are required to create a task. Everything else is optional. This mirrors the current workflow where tasks are one-line markdown checkboxes — low friction to enter, detail added later.

### 4. Kanban Board View
Drag-and-drop board per project. Columns for each status. Cards show: title, assignee avatar, priority badge, due date. Toggle between Kanban and List view.

**Why:** Visual task management that's familiar to anyone who's used Trello.

### 5. List View
Sortable table with all task fields. Filter by: assignee, priority, status, tags, date range. Search across all projects. Quick status change via dropdown in each row.

**Why:** Power-user view for rapid task scanning and bulk management.

### 6. Blocker Tracking
Any task can be flagged as a "blocker" with a description of what it blocks and why. Blockers appear on the dashboard with visual indicators.

**Why:** The current `MASTER-TODO.md` has a dedicated "Blocked / Waiting On" table with 8 entries. This is critical information that needs visibility.

### 7. Weekly Report Generator
Auto-generate the 7-section template from task data. Two sections auto-populate (Pending Projects from active tasks, Key Accomplishments from completed tasks). IC fills remaining sections manually. Auto-save drafts. Submit for manager review.

**Why:** This is the primary value proposition — replacing the Excel workbook. See `weekly-report-workflow.md` for full details.

### 8. Attendance Tracking
Weekly boolean grid (Mon-Fri per person). Manager/Admin edits. Replaces the AttendanceChecklist sheet in the Excel workbook.

### 9. Report Export (Excel + PDF)
Export weekly reports to `.xlsx` matching the current 7-section template format. Also export to PDF with RS branding. Manager can export all IC reports for a given week as a single workbook (one sheet per IC).

**Why:** Backward compatibility. Management currently receives Excel reports — the export must produce familiar output.

### 10. Dashboard
Single-screen overview:
- 4 project cards (C1-C4) with task count by status
- "My Tasks" — assigned tasks sorted by due date
- "Upcoming Deadlines" — tasks due this week + next
- "Team Workload" — bar chart per person (Manager+ only)
- "Active Blockers" — flagged blocker tasks
- Friday reminder banner if report not yet submitted

**Why:** Solves the "no cross-project visibility" problem. One screen to see everything.

### 11. Activity Log
Per-task chronological history: status changes, assignments, priority changes, comments. Shows who did what and when.

**Why:** Audit trail for accountability. Replaces the informal "who changed this?" conversations.

---

## Phase 2 (After MVP is Stable)

### 12. Dependency Graph
Visual connections between tasks showing which tasks block others. When a dependency is resolved, the downstream task becomes unblocked automatically.

### 13. Task Comments
Threaded comments on tasks with @mentions. Keeps discussion attached to the task instead of scattered across chat.

### 14. In-App Notifications
Bell icon with notification list: task assigned to you, deadline approaching (24h/1h), blocker resolved, report reminder (Friday 3pm), revision requested on report.

### 15. Report History & Comparison
Browse past weekly reports. Side-by-side view comparing this week vs. last week to spot patterns.

### 16. Bulk Operations
Multi-select tasks for: status change, reassignment, tag update, project move. Useful for end-of-sprint cleanup.

### 17. Saved Filter Presets
Custom named filters (e.g., "Ken's Blockers", "All High Priority", "Overdue This Week") saved per user.

---

## Phase 3 (Future)

### 18. Trello Integration
Import Trello cards via API. Optional bidirectional sync for departments that want to keep using Trello.

### 19. Email Notifications
Send notifications via the team's self-hosted n8n instance (`n8n.kenbuilds.tech`). Follows the same webhook pattern as Certificate Creator and Email Signature tools.

### 20. Google Sheets Auto-Push
Push weekly report data to a Google Sheet for teams that still want spreadsheet access.

### 21. Time Tracking
Optional hours logged per task. Useful for capacity planning and understanding where time goes.

### 22. REST API for External Tools
Public API endpoints for n8n/Zapier integration. Allows building custom automations (e.g., "when a task is marked done, post to Slack").

### 23. Recurring Tasks
Templates for repeated tasks (e.g., "Submit weekly report" every Friday, "Monthly team standup" first Monday).

---

## Feature Priority Matrix

| Feature | Pain Point Solved | Effort | Impact |
|---------|-------------------|--------|--------|
| Weekly Report Generator | Manual Excel reports | High | **Critical** — primary value prop |
| Task Management | Scattered tracking | Medium | **High** — single source of truth |
| Dashboard | No visibility | Medium | **High** — immediate situational awareness |
| Kanban Board | No visual management | Medium | **Medium** — familiar UX |
| Blocker Tracking | Hidden blockers | Low | **High** — surfaces critical info |
| Report Export | Backward compatibility | Medium | **High** — management expects Excel |
| Auth | Multi-user access | Medium | **Required** — can't ship without it |
| Attendance | Replaces Excel sheet | Low | **Low** — small but necessary |
| Activity Log | No audit trail | Low | **Medium** — accountability |

The MVP is ruthlessly scoped to what directly solves the two biggest pain points: **manual weekly reports** and **scattered task tracking**.
