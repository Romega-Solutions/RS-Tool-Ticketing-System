# RS Ticketing System — Feasibility Research

## Executive Summary

**Can we build it?** Yes, but not right now — Ken has 33 open tasks and 3 hard deadlines by April 30.

**Should we build it?** Maybe not from scratch. No free tool can auto-generate the 7-section weekly report, BUT two strong open-source tools (Plane.so, OpenProject) cover 80% of the task management needs for free. The remaining 20% — the custom report — can be solved with a lightweight script instead of building an entire system.

**Recommended path:** Adopt a free self-hosted tool + build only the thin report layer. 1-2 days of dev work vs. 4-6 weeks for a full custom build.

---

## Part 1: Build vs. Buy — Can an Existing Free Tool Do This?

### The Verdict

**No existing tool — free or paid — can auto-generate the specific 7-section weekly report from task data.** This was tested against 14 tools. The 7-section template (Client Engagement, Risks/Issues, Pending Projects, Key Accomplishments, Ideas/Recommendations, Management Remarks, Attendance) includes sections that require human narrative input and cannot be automated.

However, two sections CAN be auto-populated from task data:
- **Pending Projects** = active tasks (todo, in_progress, in_review)
- **Key Accomplishments** = tasks completed this week

The other 5 sections require human input regardless of what tool you use.

### Tools Evaluated (14 total)

#### Viable Options (Free, Self-Hosted, Unlimited Users)

| Tool | Task Mgmt | Kanban + List | Reporting | Excel Export | Roles | Status |
|------|:-:|:-:|:-:|:-:|:-:|--------|
| **Plane.so** (Community) | Yes | Yes | Analytics dashboards | Yes (XLSX) | Yes | **Best UI, most modern** |
| **OpenProject** (Community) | Yes | Yes | Time/cost/status reports | Yes (XLS) | Yes (granular) | **Best built-in reporting** |
| **Taiga** (self-hosted) | Yes | Yes | CSV data dumps | CSV only | Yes | Agile-focused, heavier |
| **Leantime** (self-hosted) | Yes | Yes | Timesheet reports | CSV only | Yes (6 roles) | Decent, weak reporting |

#### Not Viable

| Tool | Reason |
|------|--------|
| Vikunja | No reporting, no Excel export |
| WeKan | Kanban-only, no reporting |
| Focalboard | **Abandoned project** — no longer maintained |
| Trello (free) | **10-user limit** — can't fit 26 people |
| Notion (free) | **1,000 block limit for teams** — burns out in 1 day |
| ClickUp (free) | 60MB storage, no permissions, 5 exports/month/member |
| Asana (free) | **2-10 user limit** |
| Monday.com (free) | **2 seats, 3 boards, 200 items** |
| Linear (free) | **250 issue limit** |
| Todoist (free) | Personal to-do app, not team PM |

### The Hybrid Approach

**Best option: Plane.so (self-hosted) + custom report script**

- Plane.so handles: task management, Kanban/list/spreadsheet views, projects, assignments, priorities, statuses, roles — all free, unlimited users, self-hosted
- Custom script handles: pulling task data from Plane's REST API, assembling the 7-section Excel template, leaving manual sections blank for IC input
- Script effort: 1-2 days of Ken's time (Python + openpyxl, or a simple n8n workflow)

**Alternative: OpenProject + custom report script**
- OpenProject has better built-in reporting but a more traditional/enterprise UI
- Same hybrid approach applies

---

## Part 2: Internal Capacity — Can We Build It Now?

### Ken's Workload (Only Engineer)

**33 open tasks across 4 projects:**

| Project | Tasks | Status |
|---------|:-----:|--------|
| C1 — Romega Digital | 8 | BLOCKED (on Robbie), could unblock any time |
| C2 — PinayMate | 8 | **3 hard deadlines: Apr 15, Apr 22, Apr 30** |
| C3 — Internal Tools | 16 | Backlog, no urgency but growing |
| C4 — Upskilling | 1 | Low priority |

**Hard deadlines (as of Apr 13, 2026 — when this doc was written):**
- **Apr 15:** PinayMate MVP deployment
- **Apr 22:** PinayMate wrap-up document
- **Apr 30:** PinayMate feasibility decision (auto-drop if missed)

**Assessment:** Ken **cannot** take on a 4-6 week build project right now. He is explicitly flagged in team memory as having the "heaviest workload" with a warning to "flag when assigning more to him."

### Mark's Capacity (Only Designer / PM)

**9 open tasks, but the bottleneck is worse than the count suggests:**
- Only designer remaining (Jem + Auds resigned)
- If C1 unblocks: must produce all Figma mockups, services page IA, testimonials design, team profiles
- Single point of failure for ALL design work across ALL projects

**Assessment:** Mark has more headroom than Ken in raw numbers, but the moment C1 unblocks, his queue explodes. The ticketing system's design/PM work would compete directly with the website redesign.

### Earliest Realistic Build Window

| Scenario | Ken Available | Timeline |
|----------|:------------:|----------|
| PinayMate dropped (Apr 30) + C1 stays blocked | **Early May 2026** | 4-6 weeks → done by mid-June |
| PinayMate dropped + C1 unblocks simultaneously | **Late Q2 / Q3 2026** | Ken split between C1 + ticketing |
| PinayMate continues + C1 unblocks | **Not feasible in 2026** | Ken at max capacity |

### Risk Matrix

| Risk | Probability | Impact | What Happens |
|------|:-:|:-:|--------|
| C1 unblocks mid-build | **High** (Robbie could approve any time) | **Critical** — ticketing system shelved, Ken pivots to website rebuild | No second engineer to absorb |
| PinayMate continues past Apr 30 | Medium | High — adds Phase 2/3 mobile work to Ken | Build window evaporates |
| Ken unavailable (sick, leave, quits) | Low | **Critical** — no one else can build | Zero engineering backup on the team |
| Mark's design queue explodes | High (when C1 unblocks) | Medium — ticketing system design stalls | Serial queue through one person |

---

## Part 3: Options

### Option A: Full Custom Build (Original Plan)
**What:** Build RS_Tool-Ticketing-System as specced in docs/plan/
**Effort:** 4-6 weeks of Ken's full-time work
**When:** Earliest May 2026 (if PinayMate drops and C1 stays blocked)
**Risk:** High — any project unblocking mid-build kills it
**Cost:** $0 (all open-source), but high opportunity cost (Ken's time)

### Option B: Hybrid — Adopt Plane.so + Custom Report Script
**What:** Self-host Plane.so for task management. Build a lightweight script that pulls task data via Plane's API and generates the 7-section Excel template.
**Effort:** 1 day to deploy Plane.so (Docker), 1-2 days for the report script
**When:** Ken could do this in a focused sprint, even alongside current work
**Risk:** Low — small scope, reversible, Plane handles the heavy lifting
**Cost:** $0 (Plane Community is AGPL, self-hosted, unlimited users)
**Trade-off:** Team adopts a third-party tool instead of a custom-branded RS tool. Less control over UX. Report auto-population is API-scripted, not built into the UI.

### Option C: Mark Builds MVP with AI Assistance
**What:** Mark uses Claude Code to build a minimal ticketing system — basic task forms, list views, and a report page
**Effort:** 2-3 weeks of Mark's time (learning curve included)
**When:** Could start immediately (Mark has more headroom than Ken)
**Risk:** Medium — Mark is a designer, not a developer. Backend, auth, and deployment still need Ken. Design tasks compete for Mark's time.
**Cost:** $0
**Trade-off:** Slower, learning-curve-heavy, limited to what AI-assisted coding can handle. Still needs Ken for infrastructure.

### Option D: Hire a Contractor
**What:** Bring in a freelance developer to build the system from the docs/plan/ spec
**Effort:** 3-4 weeks (contractor can work in parallel with Ken)
**When:** Could start immediately after hiring
**Risk:** Low (technical) — clear spec exists. Medium (budget) — requires Robbie's approval.
**Cost:** $3,000-$8,000 depending on region and experience
**Trade-off:** Requires budget approval. Needs Ken for code review and deployment. Could also tackle G.2 (ATS) at the same time.

### Option E: Do Nothing — Improve Current Workflow
**What:** Keep markdown TODOs + Excel. Improve with small automations (n8n workflows to pull Trello data into a report template).
**Effort:** A few hours of Ken's time to set up n8n
**When:** Immediately
**Risk:** Very low
**Cost:** $0
**Trade-off:** Doesn't solve the core problems (no dashboard, no cross-project visibility, no real-time status). Only reduces report assembly time slightly.

---

## VPS Deployment Notes

Romega already has a VPS running Docker (hosts `n8n.kenbuilds.tech` and other RS tools). Plane.so self-hosted runs on Docker Compose — same deployment pattern.

**Plane.so requirements:**
- **RAM:** 4GB minimum (PostgreSQL + Redis + app services)
- **Disk:** ~2GB for images + database growth
- **Docker Compose:** Single `docker-compose.yml` to start all services
- **Ports:** Exposes a single web port (default 80/443) — can sit behind existing reverse proxy

**Deployment steps (Ken, ~1 day):**
1. SSH into VPS, clone Plane's self-hosting repo
2. Run `docker compose up -d`
3. Configure domain (e.g., `tasks.romega-solutions.com` or `plane.kenbuilds.tech`)
4. Create admin account, set up projects (C1-C4), invite 7 core users
5. Import tasks from markdown (manual or scripted)

**No external dependencies.** Data stays on your VPS. No cloud accounts, no API keys, no subscriptions.

**Check before deploying:** Run `free -h` on the VPS to verify available RAM. If the VPS is tight, Plane can share a PostgreSQL instance with other services (e.g., Certificate Creator's production DB) to save memory.

---

## Recommendation

### For immediate value (next 2 weeks): **Option B — Plane.so + Report Script**

- Deploy Plane.so on existing infrastructure (Docker, same setup as other RS tools)
- Import C1-C4 projects and current tasks
- Build a Python script (or n8n workflow) that generates the 7-section Excel from Plane's API
- Team starts using it alongside current workflow (parallel operation)
- If it works: migrate fully. If not: uninstall, nothing lost.

**Why this over building custom:**
- 1-2 days vs. 4-6 weeks
- Zero risk to Ken's current deadlines
- Same end result for the team (task board + auto-populated reports)
- Can always build custom later if Plane.so doesn't fit

### For long-term (post-PinayMate decision): Reassess

After April 30, when the PinayMate decision is made:
- **If dropped:** Ken has capacity in May. Decide if Plane.so is working well enough, or if a custom build is still needed.
- **If continuing:** Ken has no capacity. Stick with Plane.so or consider Option D (contractor).

---

## Decision Matrix

| Factor | A: Custom Build | B: Plane + Script | C: Mark + AI | D: Contractor | E: Do Nothing |
|--------|:-:|:-:|:-:|:-:|:-:|
| Time to value | 6 weeks | **2-3 days** | 3 weeks | 4 weeks | **0** |
| Risk to current work | High | **Low** | Medium | Low | **None** |
| Ken's time needed | 6 weeks | **1-2 days** | 1-2 days | 2-3 days | 0 |
| Custom UX | **Full control** | Third-party UI | Basic | **Full control** | N/A |
| Report auto-generation | **Best** (built-in) | Good (script) | Basic | **Best** | None |
| Budget | $0 | **$0** | **$0** | $3-8K | **$0** |
| Long-term flexibility | **Highest** | Medium | Low | **Highest** | Lowest |
| Reversibility | Low | **High** | Medium | Low | **N/A** |
