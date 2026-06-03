# Setup Audit — RS-Tool-Ticketing-System

> Date: 2026-06-03 · Branch: `feat/lms` · Auditor: Claude Code
> Scope: full stack, config, docs, and drift between documentation and reality.

## TL;DR

This repo is **no longer a "ticketing system" sitting on top of Plane.so**. It has become a
full **internal operations platform** for Romega Solutions, running on **Supabase
(Postgres + Auth + Storage)** and deployed on **Vercel**. The code is current; the
**documentation, env files, and a few leftover artifacts are badly out of date** and are
the main things to update.

- ~30 Postgres tables (`pgTable`), **51 API routes**, **44 pages**.
- Auth is **Supabase Auth + Google OAuth** — not the JWT/`jose` flow the docs describe.
- The Plane.so + Python `report-script/` pipeline is **gone** but still documented as if live.
- AI features run on **Groq** (`GROQ_API_KEY`), not Gemini.

---

## 1. What this app actually is now

| Area | Reality |
|------|---------|
| Framework | Next.js **16.2.6**, React **19.2.4**, App Router, Turbopack |
| Database | **Supabase Postgres** via `postgres-js` + Drizzle (`dialect: postgresql`), pgBouncer (`prepare: false`) |
| Auth | **Supabase Auth** (`@supabase/ssr`) + Google OAuth; `sb-*-auth-token` cookies; legacy username/password (`bcryptjs` + `password_hash`) still supported in parallel |
| Storage | Supabase Storage buckets (resumes, onboarder docs) |
| AI | **Groq** (`src/lib/groq.ts`) — CEO briefing, PM status drafter, content repurposer |
| Automation | **15 n8n workflows** (`n8n/`) — ATS comms, onboarding sequence, attendance sweep, CEO briefing, PM drafter |
| Money | **Wise API** for live USD→PHP FX; per-user USD hourly rate |
| Exports | `exceljs` (weekly reports), `pdf-lib` (LMS certificates) |
| Deploy | Vercel (`vercel.json` daily cron `/api/cron/auto-clock-out`, `.vercel/`, OIDC token) |

### Feature surface (well beyond "ticketing")
- **Attendance / timesheets** — clock in/out, weekly 15h overtime cap, admin approval queue, auto clock-out cron
- **Internal PM / tickets** — projects, work items, cycles, labels, comments, activity, saved views (this is the in-app Plane replacement)
- **LMS** — courses, lessons, quizzes + server-side grading, attempts, auto PDF certificates, cohort assignments, lesson discussions, enforcement gate (12 tables)
- **Recruiting / ATS** — candidates, public `/apply` form, n8n resume parser, positions
- **Sales** leads · **Marketing** content repurposer · **CEO** daily briefing · **PM** status drafter
- **Onboarding** — onboarders, intake flows, n8n welcome/30-day/90-day/BG-check sequence
- **Rates**, **org-chart photos**, in-app **Help & Guide** wizard

### Roles (now **four**, not three)
`intern · ic · lead · admin` (`src/lib/rbac.ts`). Plus per-team **lead-tool gating** —
a lead only sees `ceo/pm/sales/marketing/recruiting/onboarding` tools their team is allow-listed for.

---

## 2. Documentation drift — the main "things to update"

### 🔴 `CLAUDE.md` (project file) — multiple wrong claims
- "**SQLite via `better-sqlite3`** … **Only table: `users`**" → now **Postgres/Supabase, ~30 tables**. `better-sqlite3` isn't even a dependency anymore.
- "**Auth: JWT signed with `jose`, `session_token` cookie, `JWT_SECRET`**" → now **Supabase Auth + Google OAuth**. No `JWT_SECRET`, no `session_token` anywhere in `src/`.
- "**Three roles**" → now **four** (`intern` added).
- Entire **Plane.so + `report-script/` Python** architecture section → **the `report-script/` directory no longer exists.** `POST /api/reports/generate` no longer shells out to `generate_report.py`.
- Env table lists `JWT_SECRET`, `REPORT_SCRIPT_DIR`, `REPORT_SCRIPT_PYTHON` (all dead) and is missing ~35 real vars (Supabase, Google OAuth, ~13 n8n webhooks, Groq, Wise, `CRON_SECRET`, etc.).
- "App Structure" tree is a tiny fraction of the real tree.

### 🔴 `README.md` — fully Plane-era, obsolete
Opens with "*Sits on top of Plane.so*", "*Python report script*", "*ICs use Plane only*". None of this is true anymore.

### 🟡 `docs/TODO.md` + `docs/plan/*`
Frozen at 2026-04-22, all about "Deploy Plane.so on VPS" / "configure report script". Historical only — should be archived or clearly marked superseded. (`docs/PLANE_DECOMMISSION_AUDIT.md` already tracks the teardown.)

---

## 3. Config & env drift

### 🔴 `.env` still carries dead Plane vars
`PLANE_BASE_URL`, `PLANE_API_KEY`, `PLANE_WORKSPACE_SLUG` are present in `.env` but Plane and the Python script are gone. Remove them.

### 🔴 `CRON_SECRET` is **not set** in local `.env`
`src/app/api/cron/auto-clock-out/route.ts` returns **HTTP 500 ("CRON_SECRET is not configured")** when it's missing, and otherwise requires `Authorization: Bearer <CRON_SECRET>`. It's in `.env.example` but absent from `.env`. → The daily auto-clock-out cron will fail locally, and on Vercel only works if it's set in the dashboard. **Verify it's set in Vercel project env.**

### 🟡 `.env` is missing several keys that `.env.example` declares
Not in `.env`: `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS`, `N8N_RECRUITER_NOTIFY_URL`, `N8N_DAY1_CALENDAR_URL`, `DEFAULT_ONBOARDING_LEAD_USER_ID`, `SUPABASE_RESUMES_BUCKET`, `SUPABASE_ONBOARDER_BUCKET`. Decide per-key: needed → add; not → drop from `.env.example`.

---

## 4. Stale files / cruft

| Item | Status | Action |
|------|--------|--------|
| `sqlite.db` | **git-tracked** 45KB binary, SQLite era | Remove + `git rm`, add to `.gitignore` |
| `sqlite.db-shm`, `sqlite.db-wal` | local, already gitignored | Delete locally |
| `package.json` `"name": "temp-app"` | never renamed | Rename to the real project name |
| `jose` dependency | only referenced in one test file since auth moved to Supabase | Verify + remove |
| `tsconfig.tsbuildinfo`, `.DS_Store` | gitignored, local-only | Fine |

---

## 5. Security / correctness notes

- **API routes are not auth-guarded by the proxy.** `src/proxy.ts` matcher excludes `/api`, `/auth`, `/onboarding`, `/guide`, `/apply`. Every API route must self-guard via `getSession()`. Worth a spot-check that all mutating routes actually do (especially `/api/admin/*`).
- **Dual auth path** — Supabase OAuth *and* legacy username/password (`bcryptjs`) coexist. Confirm this is intentional and the password path is still wanted.
- `src/db/index.ts` falls back to a placeholder `DATABASE_URL` at build time by design — fine, but means a missing real URL fails silently until first query.

---

## 6. Naming question

The repo/folder is **RS-Tool-Ticketing-System**, but the product is now a multi-module
internal ops platform (attendance, LMS, ATS, PM, sales, marketing, onboarding). The
"Ticketing System" name undersells/misdescribes it. Consider a rename (repo + `package.json`).

---

## 7. Recommended update order

1. **Rewrite `CLAUDE.md`** to match reality (stack, DB, auth, roles, real env table, true tree). — highest leverage
2. **Rewrite `README.md`** (drop Plane/Python; describe Supabase + module list).
3. **Verify `CRON_SECRET` is set in Vercel**; add it to `.env`.
4. **Clean `.env`** — remove `PLANE_*`; reconcile against `.env.example`.
5. **Untrack `sqlite.db`**, delete sqlite lock files, gitignore them.
6. **Rename** `package.json` `name` (and decide on repo rename).
7. **Archive** `docs/TODO.md` + `docs/plan/*` as historical; remove dead `jose` dep after a grep confirms.
