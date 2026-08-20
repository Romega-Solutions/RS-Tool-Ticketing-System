# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Next.js version warning**: This project uses Next.js 16, which has breaking changes from prior versions. Read `node_modules/next/dist/docs/` before writing any Next.js-specific code. Heed deprecation notices.

> **History note**: This started as a thin reporting layer on top of Plane.so (SQLite + JWT auth + a Python report script). All of that is gone. It is now a Supabase-backed internal operations platform. If you find references to Plane, `report-script/`, `better-sqlite3`, `JWT_SECRET`, or `session_token`, they are stale — see `docs/SETUP_AUDIT.md` and `docs/PLANE_DECOMMISSION_AUDIT.md`.

---

## Commands

Run all commands from the project root.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build
npm run lint
npm run verify     # lint + build together (pre-PR check)
npm test           # vitest run
```

### Database (Supabase Postgres + Drizzle)

**Single source of truth: `src/db/schema.ts`.** Migration files are derived artifacts.

```bash
# Tables: edit src/db/schema.ts, then generate + apply the Drizzle migration
npx drizzle-kit generate        # diffs schema.ts → new file in drizzle/
npx drizzle-kit migrate         # applies pending migrations (uses DATABASE_URL)
```

**Migration responsibilities (do not duplicate table DDL across the two):**

- **`drizzle/` — the canonical table-schema migration system.** Driven by `drizzle-kit`
  off `schema.ts`. History was baseline-reset on 2026-06-19: `drizzle/0000_baseline.sql`
  is the full current schema; older numbered migrations were collapsed into it. On a DB
  that already has the tables, mark the baseline as applied rather than re-running its DDL.
- **`docs/migrations/*.sql` — non-table DB objects only** (RPC functions, storage buckets,
  RLS policies, triggers, data backfills) that Drizzle cannot model. Several in-app setup
  screens and the `scripts/apply-*-migration.ts` one-shots reference these by name, so keep
  them. **Do not** add new table-only migrations here — those belong in `drizzle/`.
- `docs/supabase-setup.sql` is a legacy one-paste bootstrap and is **stale** (schema v6);
  prefer `drizzle/0000_baseline.sql` + the `docs/migrations/` object files for a fresh DB.

### Seeding

```bash
# Create Supabase Auth users for every row in public.users (default pass Demo@1234)
npx tsx scripts/seed-auth-users.ts

# Seed sample LMS courses/lessons/quiz (idempotent)
npx tsx scripts/seed-lms.ts
```

> `scripts/seed.ts` is the legacy SQLite-era seeder (inserts a bcrypt user row). Auth is
> now Supabase, so `seed-auth-users.ts` is the one that matters.

---

## Architecture

```
Next.js 16 app (src/)  ──  Supabase (Postgres + Auth + Storage)
        │
        ├── n8n webhooks (ATS comms, onboarding sequence, attendance sweep, CEO briefing, PM drafter)
        ├── Groq API (LLM features: CEO briefing, status drafter, content repurposer)
        └── Wise API (live USD→PHP FX)

Deployed on Vercel (daily cron → /api/cron/auto-clock-out).
```

This is no longer a reporting layer on a separate tool — it **is** the system. It owns its
own PM/ticketing data, attendance, LMS, recruiting/ATS, and onboarding. ~51 API routes and
~44 pages.

### Feature modules

| Module | Routes (under `(app)/`) | Notes |
|--------|-------------------------|-------|
| Attendance / timesheets | `attendance`, `live` | clock in/out, weekly 15h overtime cap, admin approval queue, auto clock-out cron |
| Weekly / status reports | `weekly-report`, `reports` | `reports` redirects into `weekly-report`; Excel export via `exceljs` |
| Internal PM / tickets | `projects/[id]`, `my-tasks` | projects, work items, cycles, labels, comments, activity, saved views — the in-app Plane replacement |
| LMS | `learning`, `admin/learning` | courses, lessons, quizzes (server-graded), auto PDF certificates (`pdf-lib`), cohort assignments, discussions, enforcement gate |
| Recruiting / ATS | `recruiting`, public `/apply` | candidates, positions, n8n resume parser, automations |
| Sales | `sales/leads` | |
| Marketing | `marketing/content` | content repurposer |
| CEO | `ceo/briefing` | Groq daily briefing |
| PM tools | `pm/status-drafter` | Groq weekly status drafter |
| Onboarding | `onboarders` | n8n welcome / BG-check / 30-day / 90-day sequence |
| Rates | `rates` | per-user USD hourly + live FX |
| Help | `help`, `/guide` | in-app guide wizard + floating drawer |

---

## Auth & RBAC

**Auth flow**: **Supabase Auth** (`@supabase/ssr`) with **Google OAuth**. Sessions live in
`sb-*-auth-token` cookies managed by Supabase. There is also a legacy username/password path
(`bcryptjs` + `users.password_hash`) handled in `src/app/auth/callback/route.ts`.

- `src/lib/supabase/{client,server,admin,config}.ts` — browser, server (SSR), service-role, and config-guard clients.
- `src/lib/session.ts` — `getSession()`: reads the Supabase user, joins `public.users` by email, returns a normalized `SessionUser` (rejects inactive users).
- `src/proxy.ts` — middleware-equivalent. Refreshes the Supabase session, clears dead `sb-*` cookies, redirects unauthenticated users to `/login`.
  - **Its matcher excludes `/api`, `/auth`, `/onboarding`, `/guide`, `/apply`.** API routes are NOT guarded by the proxy — each route must call `getSession()` itself.

**Four roles** (`src/lib/rbac.ts`):

| Role | Default landing | `/reports`, `/attendance` | `/admin/*`, `/rates` |
|------|----------------|---------------------------|----------------------|
| `intern` | `/my-tasks` | No | No |
| `ic` | `/my-tasks` | No | No |
| `lead` | `/dashboard` | Yes | No |
| `admin` | `/dashboard` | Yes | Yes |

`normalizeRole()` maps DB strings (`"ceo"`, `"tl"`, `"manager"`, `"owner"`, …) onto these four.
Leads additionally get **per-team tool gating** via `canAccessLeadTool()` — a lead only sees
the `ceo`/`pm`/`sales`/`marketing`/`recruiting`/`onboarding` tool if their `team` is allow-listed.

---

## Database

- **Engine**: **Supabase Postgres**, accessed via `postgres-js` + Drizzle ORM.
- **Client**: `src/db/index.ts` — `postgres(url, { prepare: false })` (required for the Supabase pgBouncer pooler). Falls back to a placeholder URL at build time when `DATABASE_URL` is absent.
- **Schema**: `src/db/schema.ts` — `pgTable` definitions, ~30 tables.
- **Config**: `drizzle.config.ts` — `dialect: 'postgresql'`, migrations output to `drizzle/`.
- **Storage**: Supabase Storage buckets for candidate resumes and onboarder documents (private; app issues signed URLs).

Table groups: `users`, `timesheets`, `overtime_requests`, `weekly_reports`, `attendance`;
PM (`projects`, `project_states`, `cycles`, `work_items`, `work_item_*`, `labels`, `project_members`, `saved_views`);
LMS (`lms_courses`, `lms_lessons`, `lms_lesson_completions`, `lms_quizzes`, `lms_quiz_questions`, `lms_quiz_attempts`, `lms_certificates`, `lms_course_assignments`, `lms_lesson_comments`);
plus `candidates`, `leads`, `briefings`, `status_drafts`, `content_drafts`.

Legacy username/password rows are hashed with `bcryptjs`.

---

## App Structure

```
src/
  app/
    (app)/          ← authenticated route group with shared sidebar layout (layout.tsx calls getSession())
      dashboard/ my-tasks/ projects/[id]/ attendance/ live/ weekly-report/ reports/ rates/ profile/
      learning/ learning/certificates/   admin/ admin/learning/ admin/users/ admin/overtime/
      recruiting/ sales/ marketing/ ceo/ pm/ onboarders/
    api/            ← ~51 route handlers (auth, attendance, presence, reports, lms, tickets,
                       recruiting/public, onboarding, ceo, pm, cron, fx, orgchart, admin, profile)
    apply/[positionId]/   ← public job application form (no auth)
    auth/callback/        ← Supabase OAuth + legacy password callback
    onboarding/  guide/  login/
    styles/         ← styles.css (color system), modals.css
  components/       ← app-sidebar, clock-widget, kanban-board, lms/, guide/, ui/ (shadcn), …
  db/               ← schema.ts, index.ts
  lib/
    supabase/       ← client / server / admin / config
    session.ts      ← getSession()
    rbac.ts         ← role normalization + path/tool access
    n8n.ts groq.ts  ← integration clients
    overtime-policy.ts overtime-server.ts presence.ts tickets.ts lms*.ts onboarders.ts orgchart.ts
    storage.ts format.ts export-utils.ts utils.ts
  proxy.ts          ← Supabase session refresh + auth guard
```

---

## Design System

All CSS custom properties use the `--rs-` prefix (defined in `globals.css` and `src/app/styles/styles.css`).

| Palette | Token pattern | Key values |
|---------|--------------|------------|
| Primary blue | `--rs-primary-{50-950}` | `--rs-primary-500` = `hsla(209,100%,45%,1)` (brand blue) |
| Accent orange | `--rs-accent-{50-950}` | `--rs-accent-500` = `hsla(42,94%,45%,1)` |
| Neutral (blue-tinted) | `--rs-neutral-{50-950}` | |
| Neutral grey | `--rs-neutral-grey-{50-950}` | `--rs-neutral-grey-900` = default body text |

Fonts: **Merriweather** (headings, `font-serif`) and **Source Sans 3** (body, `font-sans`), loaded via `next/font/google` in `src/app/layout.tsx`.

Utility convention: `.text-rs-{palette}-{shade}`, `.bg-rs-{palette}-{shade}`, `.border-rs-{palette}-{shade}`.

UI components come from **shadcn/ui** (`components.json` at root). The codebase uses **Base UI** (`@base-ui/react`) under the hood — note its render-prop pattern, not Radix's `asChild`.

---

## Environment Variables

`.env` at project root. See `.env.example` for the full annotated list. Key variables:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client (browser-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin client (user creation, `getSession` lookup) — secret |
| `DATABASE_URL` | Supabase Postgres pooler connection string (transaction mode, port 6543) |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | Google Sign-In (configured in Supabase) |
| `CRON_SECRET` | **Required.** Bearer token gating `/api/cron/auto-clock-out` — route returns 500 if unset. Must match the value set in Vercel and in the n8n trigger. |
| `N8N_BRIEFING_SECRET` | Bearer token for the n8n → `/api/ceo/briefing/generate` cron |
| `APP_BASE_URL` / `NEXT_PUBLIC_BASE_URL` | Public URL of this app (for n8n callbacks / OG metadata) |
| `GROQ_API_KEY` | LLM features (briefing, status drafter, content repurposer) |
| `WISE_API_TOKEN` / `WISE_API_URL` | Live USD→PHP rate (falls back to open.er-api.com if empty) |
| `ORG_CHART_API_KEY` | Org-chart photo/person lookup |
| `N8N_*_URL` | n8n webhook URLs (resume parser, ATS comms, onboarding sequence) |
| `SUPABASE_RESUMES_BUCKET` / `SUPABASE_ONBOARDER_BUCKET` | Storage bucket names (default `candidate-resumes` / `onboarder-docs`) |
| `PUBLIC_APPLICATIONS_TOKEN` | Shared bearer token for external `/api/public/applications/[positionId]` posts |
| `NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS` | `true` shows demo logins on `/login` |
| `NEXT_PUBLIC_ENABLE_DEV_LOGIN` | `true` shows the dev-only email/password sign-in block on `/login` outside local dev (e.g. on Vercel Staging). Set only in Staging, never Production. |

`.env` is gitignored; only `.env.example` is committed.
