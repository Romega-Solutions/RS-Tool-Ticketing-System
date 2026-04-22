# RS Ticketing System — Product Vision

## The Problem

Romega Solutions runs 4 active projects with a 7-person core team, but task management and weekly reporting are broken across 5 disconnected systems:

| System | What It Does | What's Wrong |
|--------|-------------|--------------|
| **Markdown TODO files** (5 files in `RS - General/`) | Track tasks per project with checkboxes, priorities, owners | Manual updates only. No notifications. Status goes stale. |
| **Trello** | Per-department task boards | Disconnected from reports. No cross-project view. |
| **Excel weekly reports** (`[ICs] RS Weekly Report.xlsx`) | 26 IC sheets, 7-section template, Friday submission | Entirely manual. Re-typing data that already exists in Trello/markdown. 30-60 min per IC per week. |
| **Google Sheets** | Aggregated reporting from Trello | Requires manual data entry from Trello. Needs paid subscription tools. |
| **Chat / Email** | Task assignments, status updates | Informal. No audit trail. Assignments get lost. |

### The Five Pain Points

**1. Manual Weekly Reports**
Every Friday, each of ~26 ICs manually fills a 7-section Excel template: Client Engagement Activities, Risks/Issues/Roadblocks, Pending Projects, Key Accomplishments, Ideas/Recommendations, and Management Remarks. Most of this data already exists in task trackers but must be re-typed. This takes 30-60 minutes per person per week.

**2. Scattered Task Tracking**
Tasks live in 5 markdown files, Trello boards, Google Sheets, and emails. The C3 Internal Tools TODO (Streams A.2-A.4) explicitly identifies the Trello-to-report pipeline as a pain point and notes the current approach "needs additional software (annual subscription)."

**3. No Cross-Project Visibility**
There is no dashboard showing all 4 projects at a glance. Checking progress requires opening individual markdown files. Robbie (approval authority) cannot see blockers. Cherry Ann (coordinator) cannot see who needs help.

**4. Invisible Workload**
Mark (only designer/PM) and Ken (only engineer) are both at capacity, but there is no single view showing who carries what. The `MASTER-TODO.md` reveals 8 active blockers and Ken owns the majority of technical tasks across all 4 projects — but this is only visible to whoever manually reads the markdown.

**5. No Automation**
No notifications when tasks are assigned, deadlines approach, or blockers are resolved. Dependencies are documented but not enforced. Weekly reports require manual assembly from disconnected sources.

---

## What This Tool Replaces

| Replaced | By |
|----------|-----|
| Individual TODO markdown files (C1-C4) | Task management with projects, statuses, owners, priorities |
| Excel weekly report workbook (26 IC sheets) | Auto-generated weekly reports from task activity |
| Manual Trello → Google Sheets pipeline | Direct task-to-report flow — no intermediary |
| Informal task assignments via chat/email | Assigned tasks with audit trail |
| C3 tasks A.2, A.3, A.4, F.5 | Resolved by this tool's existence |

**What it does NOT replace:** Trello (departments can keep using it). This tool becomes the single source of truth that Trello data can optionally flow into later (Phase 3).

---

## Product Vision

**RS Ticketing System** is a single internal web app where the Romega team manages tasks across all projects and weekly reports auto-generate from task activity.

The core value proposition: **Your weekly report writes itself.** When you complete a task on Wednesday, it shows up in your Friday report automatically. When you're working on 3 active tasks, they appear in your Pending Projects section without you typing a word. You only need to manually fill Client Engagement, Risks, and Ideas — the sections that require human context.

---

## Success Criteria

| Metric | Current State | Target |
|--------|--------------|--------|
| Friday report time per IC | 30-60 minutes | Under 10 minutes |
| Cross-project status check | Open 5 markdown files | One dashboard screen |
| Task assignment visibility | Read chat history / markdown | Assigned tasks with notification |
| Workload distribution view | Non-existent | Bar chart per team member |
| Blocker visibility | Buried in TODO files | Dedicated blocker list on dashboard |
| Weekly report cost (tools) | Annual subscription for Trello-Sheets bridge | $0 — fully self-hosted, open-source |

---

## Team Context

### Who Uses This Tool

| Person | Role | Primary Use |
|--------|------|-------------|
| **Mark** (user) | Product Designer / PM (only designer) | Dashboard, task creation, report review |
| **Ken** | Systems Integration / IT | Task updates, report submission |
| **Robbie** | Approval authority | Dashboard overview, report approval |
| **Cherry Ann** | HR / Marketing coordinator | Task tracking, report submission/review |
| **Jenn** | Sales | Report submission |
| **Duane** | Sales | Report submission |
| **Mich** | Trello automation support | Task tracking, report submission |

Additional ICs (~19 from Excel hidden sheets) can be added later via admin panel.

### Current Blockers (from MASTER-TODO.md)

| Blocker | Waiting On | Blocks |
|---------|-----------|--------|
| Pricing visibility conflict | Sales + Product Design | Digital Marketing page build |
| Website approach decision | Robbie | All website build tasks |
| PinayMate feasibility | Ken + Robbie (Apr 30 deadline) | Continue or auto-drop |
| Contact form security | Ken | Contact form launch |
| Single designer risk | Mark is the only designer | All design tasks — bottleneck |

These blockers illustrate exactly why the team needs a tool with blocker tracking and workload visibility.

---

## Cost

**$0.** The chosen approach (Option B) uses entirely free, self-hosted tools:
- **Task management:** Plane.so Community Edition (AGPL, self-hosted, unlimited users)
- **Database:** PostgreSQL + Redis (bundled with Plane's Docker Compose)
- **Report generation:** Custom Python script + openpyxl (or n8n workflow)
- **Hosting:** Docker on existing VPS (same infrastructure as other RS tools)

No paid APIs. No SaaS subscriptions. No token-based trials.

> **Note:** The original custom build spec (Option A) used Next.js + Drizzle + SQLite + shadcn/ui — also $0. That path is documented in `features.md`, `data-model.md`, and `screens.md` as reference if the team decides to build custom later.

---

## C3 Internal Tools Tasks Resolved by This Tool

From `C3 - Internal Tools & Automation/TODO-InternalTools.md`:

- **A.2** "Trello automation: clicked task → moved to weekly report" — The ticketing system IS the task-to-report pipeline.
- **A.3** "N8n/Zapier integration: Trello → Google Sheets" — Reports export directly to Excel. No Sheets intermediary needed.
- **A.4** "Trello x Weekly Report — find alternative" — THIS IS THE ALTERNATIVE. No annual subscription.
- **F.5** "Cross-department visibility for Tech ICs" — The cross-project dashboard provides this.
