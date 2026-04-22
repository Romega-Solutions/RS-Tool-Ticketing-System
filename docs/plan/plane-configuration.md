# Plane.so Configuration Guide for Romega Solutions

How to set up Plane.so to match Romega's project structure, workflow, and team. This is the handoff doc for Ken — follow this when deploying.

---

## Workspace Setup

**Workspace name:** Romega Solutions
**URL slug:** `romega` (e.g., `plane.kenbuilds.tech/romega`)

---

## Projects (4)

Create these projects in order:

| Project Code | Project Name | Description | Lead |
|:---:|---|---|---|
| C1 | Romega Digital v3 | Website expansion — services restructure, careers page, codebase rebuild (Vanilla → NextJS) | Mark |
| C2 | PinayMate Platform | Dating platform MVP — web landing + mobile app | Ken |
| C3 | Internal Tools & Automation | 7 streams: Trello automation, onboarding, newsletter, brand standards, tool proposals, hiring, internal tool builds | Ken |
| C4 | Upskilling & Research | SEO/Analytics upskilling, workflow improvement audit | Mark |

**Project identifiers:** Use C1, C2, C3, C4 as project identifiers/prefixes so tickets read like `C1-42`, `C3-17`.

---

## Task Statuses (Workflow States)

Configure these states in Plane's workflow settings for all projects:

| Status | Category | Color | Description |
|--------|----------|-------|-------------|
| Backlog | Backlog | Gray | Captured but not planned |
| To Do | Unstarted | Blue | Planned, ready to work on |
| In Progress | Started | Yellow | Actively being worked on |
| In Review | Started | Orange | Waiting for review or sign-off |
| Done | Completed | Green | Finished |
| Cancelled | Cancelled | Red | Dropped or no longer relevant |

This maps to the existing markdown convention:
- `[ ]` → To Do
- `[x]` → Done

---

## Priorities

Plane has built-in priority levels. Map them to the existing emoji convention:

| Plane Priority | Emoji Equivalent | When to Use |
|:---:|:---:|---|
| Urgent | — | Immediate action needed (blocking everything) |
| High | 🔴 | Must be done this sprint/week |
| Medium | 🟡 | Should be done soon, not blocking |
| Low | 🟢 | Nice to have, do when there's time |
| None | — | Default, not yet triaged |

---

## Labels (Tags)

Create these labels for cross-cutting categorization:

| Label | Color | Use |
|-------|-------|-----|
| `design` | Blue (#3B82F6) | Tasks requiring design work |
| `dev` | Green (#10B981) | Development/engineering tasks |
| `urgent` | Red (#EF4444) | Needs immediate attention |
| `waiting-approval` | Amber (#F59E0B) | Blocked on someone's approval |
| `blocker` | Red (#DC2626) | This task blocks other work |
| `stream-a` | Purple (#8B5CF6) | C3: Trello/Workflow Automation |
| `stream-b` | Pink (#EC4899) | C3: Onboarding |
| `stream-c` | Teal (#14B8A6) | C3: Newsletter |
| `stream-d` | Indigo (#6366F1) | C3: Brand Standards |
| `stream-e` | Orange (#F97316) | C3: Tool Proposals |
| `stream-f` | Rose (#F43F5E) | C3: Hiring & Ops |
| `stream-g` | Cyan (#06B6D4) | C3: Internal Tool Builds |

---

## Members & Roles

| Person | Email | Plane Role | Romega Role |
|--------|-------|-----------|-------------|
| Robbie | (ask) | Admin | Approval authority |
| Mark Siazon | (ask) | Admin | Product Design/PM |
| Cherry Ann | (ask) | Member | HR/Marketing coordinator |
| Ken | (ask) | Admin | IT/Engineering |
| Jenn | (ask) | Member | Sales |
| Duane | (ask) | Member | Sales |
| Mich | (ask) | Member | Operations |

**Note:** Plane Community has Member/Admin roles at workspace level, and per-project roles (Admin/Member/Viewer/Guest). Set Mark and Ken as workspace Admins so they can manage projects and settings.

---

## Task Import Mapping

When importing tasks from the markdown TODOs:

### From MASTER-TODO.md

**Blocker table rows** → Create as tasks with `blocker` label:

| Blocker (→ Task Title) | Project | Assignee | Priority |
|---|:---:|---|:---:|
| Pricing visibility conflict | C1 | (unassigned — needs Sales + Mark) | High |
| Website approach decision | C1 | Robbie | Urgent |
| PinayMate feasibility decision | C2 | Ken + Robbie | Urgent |
| Intern testimonial content | C1 | (unassigned) | Medium |
| Client testimonials | C1 | (unassigned) | Medium |
| Contact form security vulnerability | C1 | Ken | High |
| LinkedIn TOS verification | C1 | Ken | Medium |

### From C3 TODO (Streams A-G)

Each task gets the corresponding stream label. Example:
- "A.1 Generic Trello automation templates" → Project: C3, Label: `stream-a`, Assignee: Ken + Mich
- "G.5 RS Ticketing System" → Project: C3, Label: `stream-g`, Assignee: Ken + Mark

### From C1, C2, C4 TODOs

Import as-is with priority/assignee from the emoji/@ convention.

---

## Views to Create

Set up these saved views for quick access:

| View Name | Filters | Who Uses It |
|-----------|---------|-------------|
| My Tasks | Assignee = me, Status ≠ Done/Cancelled | Everyone |
| All Blockers | Label = `blocker` | Mark, Robbie |
| Ken's Load | Assignee = Ken | Mark (workload check) |
| This Week's Deadlines | Due date = this week | Everyone |
| C3 Streams | Project = C3, grouped by Label | Ken, Mark |
| High Priority | Priority = Urgent or High | Everyone |

---

## Report Script Requirements

The report script (separate from Plane) pulls data via Plane's REST API and generates the 7-section Excel. Ken builds this after Plane is running.

**API endpoints needed:**
- `GET /api/v1/workspaces/{slug}/projects/{id}/issues/` — list tasks with filters
- Filter by: assignee, status, updated date range

**Script inputs:**
- User ID (which IC's report to generate)
- Week start/end dates

**Script outputs:**
- `.xlsx` file with the 7-section template
- Sections 4 (Pending Projects) and 5 (Accomplishments) auto-populated
- Sections 2, 3, 6, 7 left blank for manual fill

**Script language:** Python + `openpyxl` (simplest), or an n8n workflow (if Ken prefers visual automation).

---

## Deployment Checklist

- [ ] Verify VPS has 4GB+ RAM available (`free -h`)
- [ ] Clone Plane self-hosting repo
- [ ] Configure `docker-compose.yml` (set domain, SMTP if wanted)
- [ ] Run `docker compose up -d`
- [ ] Set up DNS (e.g., `tasks.romega-solutions.com`)
- [ ] Create workspace "Romega Solutions"
- [ ] Create 4 projects (C1-C4) with identifiers
- [ ] Configure workflow states (6 statuses above)
- [ ] Create labels (12 above)
- [ ] Invite 7 team members with correct roles
- [ ] Import tasks from markdown TODOs
- [ ] Create saved views (6 above)
- [ ] Build report script (Python or n8n)
- [ ] Test: generate a sample weekly report Excel
- [ ] 2-week parallel operation with existing workflow
- [ ] Cutover: archive markdown TODOs, stop Excel manual entry
