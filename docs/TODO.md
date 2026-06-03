# RS Ticketing System — TODO

> ⚠️ **SUPERSEDED — historical only.** This file (and the rest of `docs/plan/`) describes the
> original proposal to deploy Plane.so on a VPS with a Python report script. That approach was
> abandoned: the app now owns its own data on Supabase and Plane was decommissioned. Kept for
> history. For the current state see **`docs/SETUP_AUDIT.md`** and **`README.md`**.

> Status: **APPROVED by Robbie (Apr 22).** Spec complete. Pitch materials polished. Next: share handoff with Ken in May.
> Last updated: 2026-04-22

---

## Action Items

### For Mark (this week)

- [x] 🔴 Share `docs/plan/feasibility.md` with Robbie — ✅ **APPROVED (2026-04-22)**
- [ ] 🔴 Share `docs/plan/handoff-ken.md` + full `docs/plan/` folder with Ken — get his input on:
  - VPS RAM availability (needs 4GB+ for Plane.so)
  - Timeline estimate for deployment (expected: 1-2 days)
  - When in May he can schedule the 1-2 day sprint
- [ ] 🟡 Check VPS RAM yourself if you have SSH access: run `free -h`
- [x] 🟡 Export docs to DOCX/PDF for offline sharing — ✅ 10 DOCX files in `docs/exports/`

### For Ken (May 2026)

- [ ] 🔴 Verify VPS capacity: `free -h` — need 4GB+ available RAM
- [ ] 🔴 Deploy Plane.so on VPS (Docker Compose) — follow `docs/plan/plane-configuration.md`
- [x] 🔴 ~~Build report script~~ — ✅ Pre-built at `report-script/generate_report.py`. Just configure `.env` and run.
- [ ] 🔴 Configure report script — `cd report-script && cp .env.example .env` → add Plane API key
- [ ] 🟡 Import tasks from markdown TODOs into Plane
- [ ] 🟡 Set up saved views (My Tasks, All Blockers, Ken's Load, etc.)
- [ ] 🟢 Test report Excel export matches current 7-section template format

### For Robbie (approval)

- [x] 🔴 Approve time allocation for Ken to deploy (1-2 days post-Apr 30) — ✅ **APPROVED (2026-04-22)**
- [x] 🟡 Review feasibility doc if needed — ✅ Approved

---

## Docs Index

| Document | What It Covers |
|----------|---------------|
| `docs/plan/product-vision.md` | Why this tool exists, what it replaces, success criteria |
| `docs/plan/features.md` | MVP / Phase 2 / Phase 3 feature breakdown |
| `docs/plan/data-model.md` | 9 database tables, entity relationships, JSON structures |
| `docs/plan/screens.md` | 15 screens with mockups, navigation, roles/permissions |
| `docs/plan/weekly-report-workflow.md` | 7-section template, auto-population logic, Excel export |
| `docs/plan/migration.md` | Import plan, parallel operation, cutover steps |
| `docs/plan/feasibility.md` | Build vs. buy (14 tools), team capacity, 5 options compared |
| `docs/plan/plane-configuration.md` | Plane.so setup: projects, statuses, labels, members, deployment checklist |
| `docs/plan/executive-summary.md` | 1-page pitch for Robbie (problem, solution, cost, ask) |
| `docs/plan/handoff-ken.md` | Deployment brief for Ken — step-by-step with time estimates |
| `docs/plan/presentation-content.md` | 8-slide presentation content for team intro (Canva-ready) |
| `docs/plan/presentation.html` | Self-contained HTML presentation (browser-viewable) |
| `docs/exports/*.docx` | DOCX exports of 8 key docs for offline sharing |

---

## Key Decisions Made

- **Approach:** Plane.so (free, self-hosted) + custom report script — NOT a full custom build
- **Cost:** $0 — all open-source, runs on existing VPS
- **Auth:** Plane handles auth (built-in)
- **MVP users:** 7 core team members first, add others via Plane admin
- **Timeline:** 1-2 days of Ken's time (post-Apr 30)

## What This Resolves

When deployed, mark these C3 tasks as done:
- A.2 — Trello automation: clicked task → moved to weekly report
- A.3 — N8n/Zapier integration: Trello → Google Sheets
- A.4 — Trello x Weekly Report — find alternative
- F.5 — Cross-department visibility for Tech ICs
