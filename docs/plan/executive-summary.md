# RS Ticketing System — Executive Summary

**Prepared by:** Mark Siazon (Product Design / PM)
**Date:** April 22, 2026
**For:** Robbie — Approval

---

## The Problem

Every Friday, each of our ~26 team members spends **30–60 minutes** manually typing their weekly report in Excel — re-entering tasks they already tracked in Trello or markdown files. That's up to **26 hours of wasted team time per week.**

On top of that:
- Tasks are scattered across 5 markdown files, Trello, Sheets, and chat — no single source of truth
- No dashboard to see project status, blockers, or who's overloaded
- No automation — everything is manual

---

## The Solution

**Adopt Plane.so** (free, open-source task management) + **a custom report script** that auto-generates the 7-section weekly report from task data.

| What Changes | How |
|---|---|
| Task tracking | One tool for all 4 projects (C1–C4) — Kanban boards, list views, priorities, assignments |
| Weekly reports | 2 of 7 sections auto-populate from tasks. ICs only fill 3 manual sections. |
| Visibility | One dashboard shows all projects, deadlines, blockers, and team workload |
| Report format | Exports to the same Excel format management already uses |

**Friday report time drops from 30–60 min to under 10 min per person.**

**Annual impact:** ~175 hours saved across the 7-person core team (~25 min/person/week × 50 weeks). That's **4+ full work weeks** returned to actual project work every year.

---

## Cost

### $0

| Item | Cost |
|---|---|
| Plane.so Community Edition | Free (AGPL, self-hosted, unlimited users) |
| Hosting | Existing VPS (Docker — same setup as our other tools) |
| Report script | Python + openpyxl (open-source) |
| Subscriptions / APIs | None |

No paid software. No trials. No hidden fees.

---

## What Ken Needs

| Task | Effort |
|---|---|
| Deploy Plane.so on VPS (Docker) | ~1 day |
| Build report script (Python or n8n) | ~1 day |
| Import tasks + configure projects | Included above |
| **Total** | **1–2 days of Ken's time (post-Apr 30)** |

---

## Risk

| Risk | Mitigation |
|---|---|
| Tool doesn't fit | 2-week parallel run with current workflow. If it fails, uninstall — nothing lost. |
| VPS capacity | Needs 4GB+ RAM — Ken verifies before deploying |
| Team adoption | Familiar UX (like Trello). Same Excel report format. Minimal behavior change. |
| Ken's availability | Only 1–2 days needed. Can be done in a focused sprint. |

---

## What This Resolves

Deploying this tool closes **4 open C3 tasks** immediately:

- **A.2** — Trello automation: clicked task → moved to weekly report
- **A.3** — N8n/Zapier integration: Trello → Google Sheets
- **A.4** — Trello × Weekly Report — find alternative
- **F.5** — Cross-department visibility for Tech ICs

---

## Timeline

| Phase | When | What |
|---|---|---|
| Product spec | Done | All documentation complete |
| **Approved** | **Apr 22** | Robbie approved 1–2 days of Ken's time in May |
| Deployment | May 2026 | Ken deploys Plane.so + report script |
| Parallel operation | Weeks 1–2 | Use new tool alongside current workflow |
| Full switch | Week 3+ | Reports come from the new system |

---

## What I'm Asking For

**Approved.** Ken has 1–2 days in May to deploy Plane.so and build the report script. Everything else is ready — share the `docs/plan/` folder and `handoff-ken.md` with Ken.

Full product spec available at: `RS_Tool-Ticketing-System/docs/plan/`
