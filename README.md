# RS Ticketing System

Internal task management + automated weekly report generation for Romega Solutions.

**Status:** **APPROVED by Robbie (Apr 22).** Spec complete. Ready for Ken's deployment post-Apr 30.
**Approach:** Self-host [Plane.so](https://plane.so) (free, open-source) + custom report script.
**Cost:** $0 — runs on existing VPS via Docker.

---

## The Problem

| Pain | Impact |
|------|--------|
| Weekly reports take 30-60 min per person per Friday | ~26 ICs re-type data from Trello/markdown into a 7-section Excel template |
| Tasks scattered across 5 markdown files, Trello, Sheets, emails | No single source of truth |
| No dashboard or workload visibility | Ken has 33 tasks, Mark is sole designer — invisible to leadership |
| No automation | No notifications, no dependency tracking, manual Trello → Sheets pipeline |

## The Solution

**Plane.so** handles task management (Kanban, list views, projects, roles, priorities) — free, self-hosted, unlimited users.

**Custom report script** pulls task data from Plane's API and generates the 7-section Excel weekly report:
- Sections 4 (Pending Projects) and 5 (Key Accomplishments) auto-populated from tasks
- Sections 2, 3, 6, 7 filled manually by the IC (requires human input)
- Export to `.xlsx` matching the current template format

**Time savings:** Friday report drops from 30-60 min to under 10 min per person.

---

## Docs

| Document | Summary |
|----------|---------|
| [TODO.md](TODO.md) | Action items for Mark, Ken, and Robbie |
| [Product Vision](docs/plan/product-vision.md) | Why this tool exists, what it replaces, success criteria |
| [Features](docs/plan/features.md) | MVP / Phase 2 / Phase 3 feature breakdown |
| [Data Model](docs/plan/data-model.md) | 9 tables, entity relationships, JSON structures |
| [Screens](docs/plan/screens.md) | 15 screens with ASCII mockups, navigation, roles/permissions |
| [Weekly Report Workflow](docs/plan/weekly-report-workflow.md) | 7-section template, auto-population logic, Excel export format |
| [Migration](docs/plan/migration.md) | Import from markdown/Excel, parallel operation, cutover |
| [Feasibility](docs/plan/feasibility.md) | 14 tools evaluated, team capacity analysis, 5 options compared |
| [Plane Configuration](docs/plan/plane-configuration.md) | Plug-and-play setup: projects, statuses, labels, members, deployment checklist |
| [Executive Summary](docs/plan/executive-summary.md) | 1-page pitch for Robbie — problem, solution, cost, ask |
| [Ken's Handoff](docs/plan/handoff-ken.md) | Deployment brief for Ken — step-by-step with time estimates |
| [Presentation Content](docs/plan/presentation-content.md) | 8-slide presentation content for team intro (Canva-ready) |
| [Presentation (HTML)](docs/plan/presentation.html) | Self-contained HTML presentation (browser-viewable) |

**DOCX exports** available in `docs/exports/` for offline sharing (8 key docs).

---

## Quick Facts

| | |
|---|---|
| **Tool** | Plane.so Community Edition (AGPL, self-hosted) |
| **Infra** | Existing VPS, Docker Compose (needs 4GB+ RAM) |
| **Users** | 7 core team initially, ~26 total capacity |
| **Resolves** | C3 tasks A.2, A.3, A.4, F.5 |
| **Deploy effort** | ~1 day (Ken, May 2026) |
| **Report script** | Pre-built — `report-script/generate_report.py` (Python + openpyxl) |

---

## Next Steps

1. ~~**Mark** → Share feasibility doc with Robbie for buy-in~~ — ✅ Approved (Apr 22)
2. **Mark** → Share docs folder with Ken for VPS RAM check + deployment prep
3. **Ken** (May 2026) → Deploy Plane.so, configure report script (pre-built), import tasks
