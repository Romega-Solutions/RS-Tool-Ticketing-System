# RS Ticketing System — Data Model

> **Note:** This doc describes the **custom build path (Option A)**. The current approach is **Option B (Plane.so + report script)** — see `feasibility.md`. Retained as reference if the team decides to build custom later.

## Entity Relationship Overview

```
User (1) ────< (many) Task (as assignee)
User (1) ────< (many) Task (as creator)
User (1) ────< (many) WeeklyReport
User (1) ────< (many) TaskActivity

Project (1) ────< (many) Task

Task (1) ────< (many) Subtask (self-referencing via parent_task_id)
Task (1) ────< (many) TaskActivity
Task (many) >──< (many) Tag (via task_tags join table)

WeeklyReport (1) ────< (many) ReportSection

User (1) ────< (many) AttendanceRecord
```

---

## Table Definitions

### users

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | integer | PK, auto-increment | |
| username | text | unique, not null | Login identifier |
| password_hash | text | not null | bcrypt hash — never store plaintext |
| name | text | not null | Display name (e.g., "Mark Siazon") |
| email | text | unique, not null | |
| role | text | not null | `admin` / `manager` / `ic` |
| team | text | nullable | e.g., "Sales", "IT", "HR/Marketing" |
| job_title | text | nullable | e.g., "Product Designer", "Systems Integration Lead" |
| is_active | integer | not null, default 1 | Boolean. 0 = deactivated (soft delete) |
| created_at | text | not null, default CURRENT_TIMESTAMP | |
| updated_at | text | not null, default CURRENT_TIMESTAMP | |

**Seed data (7 core members):**

| username | name | role | team |
|----------|------|------|------|
| robbie | Robbie | admin | Management |
| mark | Mark Siazon | manager | Design/PM |
| cherry_ann | Cherry Ann | manager | HR/Marketing |
| ken | Ken | ic | IT/Engineering |
| jenn | Jenn | ic | Sales |
| duane | Duane | ic | Sales |
| mich | Mich | ic | Operations |

---

### projects

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | integer | PK, auto-increment | |
| code | text | unique, not null | e.g., "C1", "C2", "C3", "C4" |
| name | text | not null | e.g., "Romega Digital v3" |
| description | text | nullable | Project summary |
| status | text | not null, default 'active' | `active` / `on_hold` / `completed` / `archived` |
| lead_id | integer | FK → users.id, nullable | Project lead |
| created_at | text | not null, default CURRENT_TIMESTAMP | |
| updated_at | text | not null, default CURRENT_TIMESTAMP | |

**Seed data (4 projects):**

| code | name | status | lead |
|------|------|--------|------|
| C1 | Romega Digital v3 | active | mark |
| C2 | PinayMate Platform | active | ken |
| C3 | Internal Tools & Automation | active | ken |
| C4 | Upskilling & Research | on_hold | mark |

---

### tasks

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | integer | PK, auto-increment | |
| title | text | not null | **Only required field** besides project |
| description | text | nullable | Markdown-supported long text |
| project_id | integer | FK → projects.id, not null | Which project this belongs to |
| assignee_id | integer | FK → users.id, nullable | Who is responsible |
| creator_id | integer | FK → users.id, not null | Who created the task |
| status | text | not null, default 'todo' | `backlog` / `todo` / `in_progress` / `in_review` / `done` / `cancelled` |
| priority | text | not null, default 'medium' | `high` / `medium` / `low` |
| due_date | text | nullable | ISO date string (YYYY-MM-DD) |
| completed_at | text | nullable | Set automatically when status → done |
| parent_task_id | integer | FK → tasks.id, nullable | Self-reference for subtasks |
| sort_order | integer | not null, default 0 | Position within Kanban column |
| is_blocker | integer | not null, default 0 | Boolean. 1 = this task is blocking something |
| blocker_description | text | nullable | What this blocks and why |
| created_at | text | not null, default CURRENT_TIMESTAMP | |
| updated_at | text | not null, default CURRENT_TIMESTAMP | |

**Status flow:**
```
backlog → todo → in_progress → in_review → done
                                          → cancelled (from any status)
```

**Priority mapping from existing markdown:**
- 🔴 → `high`
- 🟡 → `medium`
- 🟢 → `low`

---

### tags

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | integer | PK, auto-increment | |
| name | text | unique, not null | e.g., "design", "dev", "urgent", "waiting-approval" |
| color | text | not null | Hex color for UI display (e.g., "#EF4444") |

**Suggested initial tags:**

| Name | Color | Use |
|------|-------|-----|
| design | #3B82F6 (blue) | Design tasks |
| dev | #10B981 (green) | Development tasks |
| urgent | #EF4444 (red) | Needs immediate attention |
| waiting-approval | #F59E0B (amber) | Blocked on someone's approval |
| stream-a | #8B5CF6 (purple) | C3 Stream A (Trello) |
| stream-b | #EC4899 (pink) | C3 Stream B (Onboarding) |
| stream-g | #06B6D4 (cyan) | C3 Stream G (Tool Builds) |

---

### task_tags (join table)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| task_id | integer | FK → tasks.id, not null | Composite PK |
| tag_id | integer | FK → tags.id, not null | Composite PK |

---

### task_activities

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | integer | PK, auto-increment | |
| task_id | integer | FK → tasks.id, not null | Which task was changed |
| user_id | integer | FK → users.id, not null | Who made the change |
| action | text | not null | See action types below |
| old_value | text | nullable | Previous value |
| new_value | text | nullable | New value |
| detail | text | nullable | Extra info (e.g., comment text) |
| created_at | text | not null, default CURRENT_TIMESTAMP | |

**Action types:**
- `created` — task was created
- `status_changed` — status moved (old_value: "todo", new_value: "in_progress")
- `assigned` — assignee changed
- `priority_changed` — priority changed
- `due_date_changed` — due date set or changed
- `blocker_flagged` — task marked as blocker
- `blocker_resolved` — blocker flag removed
- `comment_added` — comment posted (Phase 2, stored in `detail`)

---

### weekly_reports

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | integer | PK, auto-increment | |
| user_id | integer | FK → users.id, not null | The IC who owns this report |
| week_start | text | not null | ISO date, Monday of the week |
| week_end | text | not null | ISO date, Friday of the week |
| status | text | not null, default 'draft' | `draft` / `submitted` / `reviewed` / `approved` |
| submitted_at | text | nullable | When IC clicked Submit |
| reviewed_by | integer | FK → users.id, nullable | Manager who reviewed |
| reviewed_at | text | nullable | When manager reviewed |
| management_remarks | text | nullable | Section 7 — filled by supervisor |
| created_at | text | not null, default CURRENT_TIMESTAMP | |
| updated_at | text | not null, default CURRENT_TIMESTAMP | |

**Status flow:**
```
draft → submitted → reviewed/approved
              ↓
         (Request Revision) → draft (back to IC)
```

**Unique constraint:** One report per user per week (user_id + week_start).

---

### report_sections

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | integer | PK, auto-increment | |
| report_id | integer | FK → weekly_reports.id, not null | Parent report |
| section_type | text | not null | See section types below |
| content | text | not null | JSON string (see structures below) |
| is_auto_generated | integer | not null, default 0 | Boolean. 1 = populated from task data |
| created_at | text | not null, default CURRENT_TIMESTAMP | |
| updated_at | text | not null, default CURRENT_TIMESTAMP | |

**Section types and their JSON content structures:**

#### `client_engagement`
```json
[
  { "activity": "Client onboarding call with ABC Corp", "date": "2026-04-14" },
  { "activity": "Follow-up meeting re: contract renewal", "date": "2026-04-16" }
]
```

#### `risks_issues`
```json
[
  {
    "description": "Pricing visibility conflict between deck and plan",
    "resolution": "Schedule alignment meeting with Sales + Product Design",
    "is_escalation": true
  }
]
```

#### `pending_projects` (auto-generated from active tasks)
```json
[
  {
    "project_name": "Romega Digital v3",
    "task_title": "Codebase migration: Vanilla JS → NextJS",
    "tat_estimate": "12 days remaining",
    "status": "On-going",
    "remarks": ""
  }
]
```

#### `accomplishments` (auto-generated from completed tasks)
```json
[
  {
    "description": "Completed all 14 deliverable documents for C1",
    "completion_date": "2026-04-11",
    "remarks": "Locked in .MD, .DOCX, .PDF formats"
  }
]
```

#### `ideas_recommendations`
```json
"Consider implementing a unified notification system across all internal tools to reduce context switching and ensure timely responses to task updates."
```
(Free-form string, not an array)

---

### attendance_records

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | integer | PK, auto-increment | |
| user_id | integer | FK → users.id, not null | |
| week_start | text | not null | ISO date, Monday of the week |
| monday | integer | not null, default 0 | Boolean |
| tuesday | integer | not null, default 0 | Boolean |
| wednesday | integer | not null, default 0 | Boolean |
| thursday | integer | not null, default 0 | Boolean |
| friday | integer | not null, default 0 | Boolean |
| created_at | text | not null, default CURRENT_TIMESTAMP | |
| updated_at | text | not null, default CURRENT_TIMESTAMP | |

**Unique constraint:** One record per user per week (user_id + week_start).

---

## Status Mapping: Task → Report

When auto-generating the "Pending Projects" report section from task data:

| Task Status | Report Status | Display |
|-------------|--------------|---------|
| `backlog` | (excluded) | Not shown in report |
| `todo` | Drafted | Task created but not started |
| `in_progress` | On-going | Actively being worked on |
| `in_review` | For Approval | Waiting for review/sign-off |
| `done` | (moves to Accomplishments) | Completed this week |
| `cancelled` | (excluded) | Not shown in report |

This mapping preserves the existing Excel report statuses ("Drafted", "For Approval", "On-going") that the team is already familiar with.
