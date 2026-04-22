# Ken's Deployment Handoff — RS Ticketing System

**Status:** Approved by Robbie (Apr 22, 2026). Ready to deploy in May 2026.
**Estimated effort:** ~1 day total (report script pre-built, just needs config).
**Prepared by:** Mark

---

## TL;DR

Deploy Plane.so (free, self-hosted task management) on our VPS via Docker. Then build a Python script that generates the 7-section weekly report Excel from Plane's API. That's it.

---

## Step 1: Check VPS (15 min)

```bash
ssh <vps>
free -h          # Need 4GB+ available RAM
df -h            # Need ~2GB disk for Plane images + DB
docker --version # Confirm Docker is running
```

If RAM is tight, Plane can share a PostgreSQL instance with other services (e.g., Certificate Creator's prod DB) to save memory.

---

## Step 2: Deploy Plane.so (~3–4 hours)

Full config details: [`plane-configuration.md`](plane-configuration.md)

**Quick version:**
1. Clone Plane's self-hosting repo on VPS
2. Configure `docker-compose.yml` — set domain, ports, SMTP (optional)
3. `docker compose up -d`
4. Set up DNS: `tasks.romega-solutions.com` or `plane.kenbuilds.tech`
5. Create admin account → workspace "Romega Solutions" (slug: `romega`)

**After Plane is running:**
- Create 4 projects: C1, C2, C3, C4 (use as identifiers so tickets read `C1-42`, `C3-17`)
- Configure 6 workflow states: Backlog → To Do → In Progress → In Review → Done / Cancelled
- Create 12 labels (design, dev, urgent, waiting-approval, blocker, stream-a through stream-g)
- Invite 7 team members with roles per the config doc
- Set up 6 saved views (My Tasks, All Blockers, Ken's Load, This Week's Deadlines, C3 Streams, High Priority)

---

## Step 3: Import Tasks (~1–2 hours)

Import from the markdown TODOs into Plane. Can be manual or scripted.

**Parsing rules (if scripting):**
- `[ ]` → status: To Do | `[x]` → status: Done
- 🔴 → High | 🟡 → Medium | 🟢 → Low
- `@Ken` → assignee: Ken | `@Mark` → assignee: Mark | etc.
- C3 stream headings → corresponding stream label

**Source files:**
- `RS - General/MASTER-TODO.md` (blocker table → blocker-labeled tasks)
- `RS - General/C1 - .../TODO-RomegaDigital.md`
- `RS - General/C2 - .../TODO-PinayMate.md`
- `RS - General/C3 - .../TODO-InternalTools.md`
- `RS - General/C4 - .../TODO-Upskilling.md`

Full parsing spec: [`migration.md`](migration.md)

---

## Step 4: Configure Report Script (~30 min)

**The report script is already built.** Located at `report-script/generate_report.py`.

**Setup:**
```bash
cd report-script
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your Plane API key and base URL
```

**Test it:**
```bash
python generate_report.py --dry-run   # Verify config
python generate_report.py --bulk      # Generate all reports
```

**What it does:** Connects to Plane's API, pulls task data per user, generates the 7-section `.xlsx` weekly report. Sections 4 (Pending Projects) and 5 (Key Accomplishments) auto-populate from tasks. Sections 2, 3, 6, 7 are left blank for IC manual input.

**Optional: automate with cron:**
```bash
# Every Friday at 3 PM
0 15 * * 5 cd /path/to/report-script && /path/to/venv/bin/python generate_report.py --bulk
```

See `report-script/README.md` for full usage and configuration details.

---

## Step 5: Test & Parallel Run (2 weeks)

- **Week 1:** Team uses Plane AND continues Trello/markdown. Reports generated from both systems.
- **Week 2:** Plane is primary. Compare auto-generated Excel with manually-filled Excel.
- **Week 3+:** Full switch if no issues.

Full migration plan: [`migration.md`](migration.md)

---

## Key Docs Reference

| Doc | What You Need It For |
|-----|---------------------|
| [`plane-configuration.md`](plane-configuration.md) | Projects, statuses, labels, members, deployment checklist |
| [`weekly-report-workflow.md`](weekly-report-workflow.md) | Report sections, auto-population logic, Excel export format |
| [`migration.md`](migration.md) | Task import rules, parallel operation, cutover steps |
| [`data-model.md`](data-model.md) | Reference for table schemas |
| `report-script/README.md` | Report script setup, usage, and automation |
| [`feasibility.md`](feasibility.md) | Background on why Plane.so was chosen over 13 alternatives |

---

## Questions?

Hit up Mark for product/design questions. This doc + the `docs/plan/` folder should cover everything technical.
