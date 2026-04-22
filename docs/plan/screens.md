# RS Ticketing System — Screens & UX

> **Note:** This doc describes the **custom build path (Option A)**. The current approach is **Option B (Plane.so + report script)** — see `feasibility.md`. Retained as reference if the team decides to build custom later.

## Navigation Structure

Persistent collapsible sidebar (like Jira, Linear, Notion). On mobile, collapses to hamburger menu.

```
[RS Logo] Ticketing System
─────────────────────────────
  Dashboard              /dashboard
  My Tasks               /my-tasks
─────────────────────────────
  Projects
    C1 - Romega Digital  /projects/c1
    C2 - PinayMate       /projects/c2
    C3 - Internal Tools  /projects/c3
    C4 - Upskilling      /projects/c4
─────────────────────────────
  Weekly Reports         /reports
  Attendance             /attendance
─────────────────────────────
  [Manager+ only]
  Team Overview          /team
─────────────────────────────
  [Admin only]
  Settings               /settings
    Users                /settings/users
    Projects             /settings/projects
    Tags                 /settings/tags
─────────────────────────────
  [User avatar + name]
  Profile                /profile
  Logout
```

---

## Screen Inventory (15 screens)

### 1. Login Page (`/login`)

Simple username + password form. RS branding: blue primary color, Merriweather heading "Romega Solutions — Task Management", Source Sans 3 body text. No registration — admin creates accounts.

Error state: "Invalid username or password" in red below the form.

### 2. Dashboard (`/dashboard`)

The home screen after login. Shows everything at a glance.

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│ [Friday Banner: "Weekly report due today at 11:59pm"]│  ← Only shows on Friday if not submitted
├─────────────┬──────────────┬────────────┬───────────┤
│ C1 Card     │ C2 Card      │ C3 Card    │ C4 Card   │  ← Project cards with task counts
│ 12 tasks    │ 5 tasks      │ 22 tasks   │ 3 tasks   │
│ 3 done      │ 1 blocked    │ 4 in prog  │ 0 in prog │
├─────────────┴──────┬───────┴────────────┴───────────┤
│ My Tasks (top 10)  │ Upcoming Deadlines              │
│ ☐ Fix security...  │ Apr 15: MVP Deploy (Ken)        │
│ ☐ Build careers... │ Apr 22: Wrap-up doc (Ken)       │
│ ☐ Services IA...   │ Apr 30: Feasibility (Ken+Rob)   │
│ [View All →]       │                                  │
├────────────────────┼─────────────────────────────────┤
│ Team Workload      │ Active Blockers                  │
│ Mark ████████ 8    │ ⚠ Pricing visibility conflict    │
│ Ken  ██████████ 14 │ ⚠ Website approach decision      │
│ Mich ██ 2          │ ⚠ Contact form security          │
│ [Manager+ only]    │                                  │
└────────────────────┴─────────────────────────────────┘
```

- **Project cards:** Click navigates to project board. Shows: name, status badge, task count by status.
- **My Tasks:** Top 10 assigned tasks sorted by due date. Priority badges (colored dots).
- **Upcoming Deadlines:** Tasks due this week + next week across all projects.
- **Team Workload:** Horizontal bar chart per person, colored by priority. Manager+ only.
- **Active Blockers:** Tasks flagged as blockers with descriptions. Click to open task.
- **Friday banner:** Persistent orange banner if it's Friday and user hasn't submitted their report.

### 3. My Tasks (`/my-tasks`)

Filtered list of all tasks assigned to the current user.

**Tabs:** Active (todo + in_progress + in_review) | Backlog | Completed | All

**Table columns:** Title | Status | Priority | Project | Due Date

Sortable by any column. Quick status change via dropdown in each row. Click task title to open task detail slide-over.

### 4. Project Board (`/projects/[code]`)

**Toggle:** Kanban Board / List View (saved preference in browser)

**Kanban view:**
```
┌──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐
│   Backlog    │    To Do     │ In Progress  │  In Review   │     Done     │
├──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤
│ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │ ┌──────────┐ │
│ │ Task card│ │ │ Task card│ │ │ Task card│ │ │ Task card│ │ │ Task card│ │
│ │ @Ken  🔴 │ │ │ @Mark 🟡 │ │ │ @Ken  🔴 │ │ │ @Mark 🟡 │ │ │ @Ken  ✓  │ │
│ │ Apr 15   │ │ │ Apr 22   │ │ │ -        │ │ │ Apr 30   │ │ │ Apr 10   │ │
│ └──────────┘ │ └──────────┘ │ └──────────┘ │ └──────────┘ │ └──────────┘ │
│              │ ┌──────────┐ │              │              │              │
│              │ │ Task card│ │              │              │              │
│              │ │ @Mich 🟢 │ │              │              │              │
│              │ └──────────┘ │              │              │              │
└──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘
```

Drag-and-drop cards between columns. Cards show: title, assignee avatar, priority badge (colored), due date. Blocker cards have a red left border.

**List view:** Full sortable table with all fields visible.

**Filter bar:** Assignee dropdown, Priority dropdown, Tags multi-select, Date range picker. Filters persist in URL params (shareable).

**Header:** Project name, code, description (expandable), lead name, status badge, total task count.

**"+ New Task" button** in header area.

### 5. Task Detail (Slide-over panel)

Opens as a right-side panel over the board/list. Does NOT navigate away — preserves context.

```
┌──────────────────────────────────────────────┐
│ Task Detail                           [× Close]
├────────────────────────┬─────────────────────┤
│                        │ Status: [In Progress]│
│ Title (editable)       │ Priority: [High ▼]   │
│ ─────────────────────  │ Assignee: [Ken ▼]    │
│ Description            │ Due Date: [Apr 15]   │
│ (markdown editor)      │ Project: C2          │
│                        │ Tags: [dev] [urgent] │
│                        │ ☐ Blocker            │
│ ─────────────────────  │                      │
│ Subtasks               │ Created: Apr 2, 2026 │
│ ☑ Deploy to staging    │ Updated: Apr 10      │
│ ☐ Run smoke tests      │                      │
│ ☐ Get approval         │                      │
│ [+ Add subtask]        │                      │
│                        │                      │
│ ─────────────────────  │                      │
│ Activity               │                      │
│ Apr 10 - Ken changed   │                      │
│   status: todo →       │                      │
│   in_progress          │                      │
│ Apr 2 - Mark created   │                      │
│   this task            │                      │
├────────────────────────┴─────────────────────┤
│ [Delete Task]                                 │
└──────────────────────────────────────────────┘
```

**Left column:** Title (inline editable), Description (markdown), Subtasks (checkbox list with add), Activity log.
**Right column:** Status, Priority, Assignee, Due Date, Project, Tags, Blocker toggle + description, timestamps.

### 6. Task Creation Form (Modal)

Opens as a centered modal. Fields:
- **Title** (required) — text input
- **Project** (required, pre-selected if opened from a project board) — dropdown
- **Description** — textarea (markdown)
- **Assignee** — dropdown of active users
- **Priority** — radio: High / Medium (default) / Low
- **Due Date** — date picker
- **Tags** — multi-select

**Buttons:** "Create Task" | "Create & Add Another" (stays open for rapid entry)

### 7. Weekly Reports List (`/reports`)

**IC view:** List of their own reports by week. Each row: Week (e.g., "Apr 7 - Apr 11"), Status badge (Draft/Submitted/Reviewed/Approved), Submitted date.

**Manager view:** Table of all ICs for the current week:

```
┌─────────────────────────────────────────────────┐
│ Weekly Reports — Week of April 7, 2026          │
│ [← Previous Week]  [Next Week →]               │
├──────────────┬──────────┬───────────────────────┤
│ Name         │ Status   │ Actions               │
├──────────────┼──────────┼───────────────────────┤
│ Ken          │ ✅ Approved│ [View]               │
│ Jenn         │ 📝 Draft  │ [Remind]             │
│ Duane        │ 📤 Submitted│ [Review]            │
│ Mark         │ 📝 Draft  │ [Edit]               │
│ Mich         │ 📤 Submitted│ [Review]            │
└──────────────┴──────────┴───────────────────────┘
```

**Top card:** Current week's report with prominent action: "Start Report" / "Continue Editing" / "Submitted ✓"

**Deadline indicator:** If Friday, show countdown to 11:59 PM.

### 8. Report Editor (`/reports/[id]`)

The 7-section form. See `weekly-report-workflow.md` for full detail.

```
┌─────────────────────────────────────────────────┐
│ Weekly Report                                    │
│ Name: Mark Siazon   Coverage: Apr 7 - Apr 11    │
│ Status: Draft       [Save Draft] [Submit Report] │
├─────────────────────────────────────────────────┤
│                                                  │
│ § Client Engagement Activities                   │
│ ┌────────────────────────────────┬─────────────┐│
│ │ Activity                       │ Date        ││
│ ├────────────────────────────────┼─────────────┤│
│ │ [text input]                   │ [date pick] ││
│ │ [text input]                   │ [date pick] ││
│ │ [+ Add Row]                                  ││
│ └──────────────────────────────────────────────┘│
│                                                  │
│ § Risks / Issues / Roadblocks                    │
│ ┌────────────────────┬────────────────┬────────┐│
│ │ Description        │ Resolution     │ Escal? ││
│ ├────────────────────┼────────────────┼────────┤│
│ │ [text]             │ [text]         │ [☐]    ││
│ │ [+ Add Row]                                  ││
│ └──────────────────────────────────────────────┘│
│                                                  │
│ § Pending Projects  ⚡ Auto-generated from tasks │
│ ┌──────────────────────────────────────────────┐│
│ │ "Auto-generated from your active tasks.      ││
│ │  Feel free to edit, add, or remove entries."  ││
│ ├──────────┬────────┬──────────┬───────┬───────┤│
│ │ Project  │ Task   │ TAT      │Status │Remarks││
│ ├──────────┼────────┼──────────┼───────┼───────┤│
│ │ C1       │ Code.. │ 12 days  │On-gng │[edit] ││
│ │ C2       │ MVP..  │ 3 days   │On-gng │[edit] ││
│ │ [+ Add Manual Row]                           ││
│ └──────────────────────────────────────────────┘│
│                                                  │
│ § Key Accomplishments  ⚡ Auto-generated         │
│ ┌──────────────────────────────────────────────┐│
│ │ Tasks you completed this week:                ││
│ ├────────────────────┬────────────┬────────────┤│
│ │ Description        │ Completed  │ Remarks    ││
│ ├────────────────────┼────────────┼────────────┤│
│ │ All 14 deliverables│ Apr 10     │ [edit]     ││
│ │ [+ Add Manual Row]                           ││
│ └──────────────────────────────────────────────┘│
│                                                  │
│ § Ideas / Recommendations                        │
│ ┌──────────────────────────────────────────────┐│
│ │ [free-form text area]                         ││
│ └──────────────────────────────────────────────┘│
│                                                  │
│ § Management Remarks  (read-only for IC)         │
│ ┌──────────────────────────────────────────────┐│
│ │ [Filled by manager after submission]          ││
│ └──────────────────────────────────────────────┘│
│                                                  │
│ Auto-saved 2 minutes ago                         │
│ [Save Draft]  [Submit Report]                    │
└─────────────────────────────────────────────────┘
```

**Auto-save:** Saves draft every 30 seconds or on field blur. Shows "Auto-saved X ago" indicator.

**Submit:** Confirmation dialog: "Submit your weekly report for the week of Apr 7-11? You won't be able to edit after submission." → Submit / Cancel.

### 9. Report Review (Manager view of `/reports/[id]`)

Same layout as Report Editor but:
- All IC sections are read-only
- Management Remarks section is editable
- Actions: "Approve" | "Request Revision" (returns to IC as Draft with a note)

### 10. Attendance (`/attendance`)

Weekly grid:

```
┌─────────────────────────────────────────────────┐
│ Attendance — Week of April 7, 2026              │
│ [← Previous Week]  [Next Week →]               │
├──────────────┬─────┬─────┬─────┬─────┬─────────┤
│ Name         │ Mon │ Tue │ Wed │ Thu │ Fri     │
├──────────────┼─────┼─────┼─────┼─────┼─────────┤
│ Mark Siazon  │ [✓] │ [✓] │ [✓] │ [✓] │ [✓]    │
│ Ken          │ [✓] │ [✓] │ [ ] │ [✓] │ [✓]    │
│ Cherry Ann   │ [✓] │ [✓] │ [✓] │ [✓] │ [ ]    │
│ ...          │     │     │     │     │         │
└──────────────┴─────┴─────┴─────┴─────┴─────────┘
```

Manager/Admin can toggle checkboxes. IC sees own row only (read-only or self-report — configurable).

### 11. Team Overview (`/team`, Manager+ only)

Grid of team member cards:

```
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│ 👤 Ken          │  │ 👤 Mark         │  │ 👤 Mich         │
│ IT/Engineering  │  │ Design/PM      │  │ Operations     │
│                 │  │                 │  │                 │
│ Tasks: 14       │  │ Tasks: 8        │  │ Tasks: 2        │
│ Overdue: 2 🔴   │  │ Overdue: 0      │  │ Overdue: 0      │
│ Blockers: 3     │  │ Blockers: 1     │  │ Blockers: 0     │
│                 │  │                 │  │                 │
│ [View Tasks →]  │  │ [View Tasks →]  │  │ [View Tasks →]  │
└────────────────┘  └────────────────┘  └────────────────┘
```

Click "View Tasks" to see that person's full task list + report history.

### 12. Settings — Users (`/settings/users`, Admin only)

User table: Name | Username | Email | Role | Team | Status (Active/Inactive)

Actions: Add User (modal form), Edit (modal), Deactivate (soft delete with confirmation).

**Add user form:** Username, Temporary Password, Name, Email, Role (dropdown), Team (dropdown), Job Title.

### 13. Settings — Projects (`/settings/projects`, Admin only)

Project table: Code | Name | Status | Lead | Task Count

Actions: Add Project, Edit, Archive.

### 14. Settings — Tags (`/settings/tags`, Admin/Manager)

Tag table: Name | Color (swatch) | Usage Count

Actions: Add Tag (name + color picker), Edit, Delete (with confirmation showing affected task count).

### 15. Profile (`/profile`)

View/edit own info: Name, Email. Change Password (current password + new password + confirm).

---

## User Roles & Permissions

| Action | Admin (Robbie) | Manager (Mark, Cherry Ann) | IC (Ken, Jenn, Duane, Mich) |
|--------|:-:|:-:|:-:|
| View dashboard (full) | ✓ | ✓ | Limited (own metrics only) |
| Create/edit projects | ✓ | ✓ | ✗ |
| Create tasks (any project) | ✓ | ✓ | Own project only |
| Assign tasks to others | ✓ | ✓ | ✗ (can self-assign) |
| Change any task's status | ✓ | ✓ | Own tasks only |
| View all tasks/projects | ✓ | ✓ | ✓ (read-only for others) |
| Submit weekly report | — | Own | Own |
| View all weekly reports | ✓ | ✓ | Own only |
| Add management remarks | ✓ | ✓ | ✗ |
| Approve weekly reports | ✓ | ✓ | ✗ |
| View team overview | ✓ | ✓ | ✗ |
| Manage users | ✓ | ✗ | ✗ |
| Manage tags | ✓ | ✓ | ✗ |
| Edit attendance | ✓ | ✓ | ✗ |
| Export reports | ✓ | ✓ | Own only |

---

## Key UX Decisions

**1. Sidebar nav, not top nav.**
The Certificate Creator uses a top header (4 pages). This tool has 15+ screens — needs persistent hierarchy. Sidebar collapses on mobile.

**2. Slide-over for task detail, not full-page.**
Clicking a task in Kanban or list opens a right-side slide-over panel. Preserves board context. Allows rapid task review without navigating away. Full-page URL (`/projects/c1/tasks/123`) exists for direct linking.

**3. Auto-save reports, explicit submit.**
Report editor saves drafts automatically every 30 seconds. No data loss — unlike the current Excel workflow where an unsaved file means redoing everything. Submit is an explicit action with confirmation.

**4. Reports editable until submitted, not until Friday.**
The Friday 11:59 PM deadline is a soft reminder, not a hard cutoff. ICs can still submit after the deadline (marked as "Late"). This matches current team behavior.

**5. Auto-populated sections are editable.**
The system generates Pending Projects and Accomplishments from task data. But the IC can edit, delete, or add entries. A subtle banner says "Auto-generated from your tasks — feel free to edit."

**6. Minimal required fields.**
Only title + project to create a task. Mirrors the current one-line markdown checkbox workflow. Low friction entry, details added later.

**7. Priority colors match existing convention.**
🔴 High = red, 🟡 Medium = yellow, 🟢 Low = green. Same visual language the team already uses in markdown.
