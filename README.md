# RS Ticketing System

Internal reporting and visibility layer for Romega Solutions. Sits on top of Plane.so — it does not replace it.

## Architecture

```
Plane.so (source of truth)
    ↓
Python report script / Next.js API (transformation layer)
    ↓
Excel reports + Web dashboard (presentation layer)
```

### Who uses what

| Role | Tool | What they do |
|------|------|-------------|
| **ICs** (Ken, Jenn, Duane, Mich) | Plane only | Create/update tasks, set status, due dates, labels |
| **Team Leads** (Mark, Cherry Ann) | Plane + reports | Review tasks, generate/receive weekly reports, add context |
| **Admin/CEO** (Robbie) | Custom web app | Dashboard view, download reports, see risks across org |

ICs never touch this app. Plane is their system. This app is for visibility and reporting only.

---

## Components

### 1. Report Script (`report-script/`)

Python script that pulls task data from Plane's API and generates the 7-section weekly report as `.xlsx`.

**Auto-populated sections:**
- Section 4: Pending Projects (active tasks: backlog/unstarted/started and todo/in_progress/in_review)
- Section 5: Key Accomplishments (tasks completed this week)

**Manually filled by ICs:**
- Section 2: Client Engagement Activities
- Section 3: Risks / Issues / Roadblocks
- Section 6: Ideas / Recommendations
- Section 7: Management Remarks (filled by supervisor)

**Setup:**
```bash
cd report-script
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Fill in PLANE_BASE_URL, PLANE_API_KEY, PLANE_WORKSPACE_SLUG
```

**Usage:**
```bash
python generate_report.py                      # current week, all users
python generate_report.py --user "Ken Garcia"  # one user
python generate_report.py --user "ken@romega-solutions.com"   # one user by email
python generate_report.py --user "135f22ae-dd76-402b-a54f-a9aa6d28af8d"  # one user by id
python generate_report.py --week 2026-05-05    # specific week (Monday date)
python generate_report.py --bulk               # all users, one workbook
python generate_report.py --dry-run            # validate config only
python generate_report.py --debug-members --user "ken"  # debug member matching
python generate_report.py --debug-issues --user "ken"   # debug issue/status mapping
python check_members.py                         # show member count
python check_members.py --show-all             # list all members
```

**Automate (cron — every Friday 3pm):**
```bash
0 15 * * 5 cd /path/to/report-script && /path/to/venv/bin/python generate_report.py --bulk
```

---

### 2. Web App (`src/`)

Next.js 16 app (App Router). Built for leads and admin only — not for ICs.

**Stack:** Next.js 16 · Drizzle ORM · SQLite · shadcn/ui · Tailwind v4

**Core features (MVP):**
- Admin dashboard: completed vs. pending tasks per person, risks flagged in Plane
- Generate reports: select user + week → download Excel
- Bulk reports: generate all users → download ZIP
- Report history: list of past generated reports, download anytime

**Dev (from project root):**
```bash
cd /Users/kuya/Documents/WORK/RS_Workspace/RS_Tools/RS-Tool-Ticketing-System
npm install
npm run dev     # http://localhost:3000
npm run build
npm run lint
```

If you see `Can't resolve 'tailwindcss' in '/.../RS_Tools'`, you're running from the parent folder instead of this repository root. `cd` into this project path first, then run the npm commands above.

---

## Plane.so Configuration

Self-hosted at: `https://romega-projects-rs-plane.ikuuwb.easypanel.host`

Workspace slug: `romega-solutions`

**Projects:** C1 (Romega Digital v3) · C2 (PinayMate) · C3 (Internal Tools) · C4 (Upskilling)

**Workflow states:** Backlog → To Do → In Progress → In Review → Done / Cancelled

**Labels ICs must use for reports to work:**
- `client-engagement`
- `risk` or `blocked`
- `idea`

> Sections 2/3/6 are currently manual in the generated Excel. These labels are for process consistency and future automation.

**Minimum task fields required (enforce this with team):**
- Assignee (must be set)
- Status (must be kept current)
- Due date (must be set)

Without these, report auto-population breaks.

---

## Failure Modes

**Garbage in → garbage out.** If ICs don't assign tasks, set status, or add due dates, reports will be empty or wrong. Enforce the minimum fields above.

**Leads ignoring reports.** Automate delivery via n8n or cron so it doesn't depend on someone manually generating.

---

## Docs

| Doc | What it covers |
|-----|---------------|
| `docs/plan/handoff-ken.md` | Step-by-step deployment checklist |
| `docs/plan/plane-configuration.md` | Projects, states, labels, members setup |
| `docs/plan/weekly-report-workflow.md` | Report sections, auto-population logic |
| `docs/plan/migration.md` | Task import from markdown TODOs, parallel run, cutover |
| `docs/plan/data-model.md` | DB schema reference (web app) |
| `docs/plan/features.md` | Web app feature spec (Option A reference) |
| `report-script/README.md` | Report script full usage and config |
