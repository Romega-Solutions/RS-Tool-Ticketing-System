# RS Internal Operations Platform

Romega Solutions' internal web app — attendance, project tracking, learning (LMS),
recruiting, onboarding, and lead/admin tooling in one place.

> **Naming note**: the repo is still called `RS-Tool-Ticketing-System`. It began life as a
> read-only reporting layer on top of Plane.so, but it has since absorbed those
> responsibilities and several more. Plane.so and the old Python report script have been
> decommissioned (see `docs/PLANE_DECOMMISSION_AUDIT.md`). A full picture of the current
> state lives in `docs/SETUP_AUDIT.md`.

## Stack

- **Next.js 16** (App Router) · **React 19** · TypeScript · Tailwind v4 · **shadcn/ui** + Base UI
- **Supabase** — Postgres (Drizzle ORM), Auth (Google OAuth), Storage
- **n8n** — webhook automations (ATS comms, onboarding sequence, attendance sweep, CEO briefing)
- **Groq** — LLM features (CEO briefing, PM status drafter, content repurposer)
- **Wise API** — live USD→PHP exchange rate
- Excel export (`exceljs`), PDF certificates (`pdf-lib`)
- Deployed on **Vercel** (daily cron → `/api/cron/auto-clock-out`)

## Modules

| Module | What it does |
|--------|--------------|
| **Attendance** | Clock in/out, weekly 15h overtime cap with admin approval, auto clock-out cron |
| **Weekly reports** | 7-section weekly/status reports with Excel export |
| **Projects / tickets** | In-app PM: projects, work items, cycles, labels, comments, saved views (replaces Plane) |
| **LMS** | Courses, lessons, server-graded quizzes, auto PDF certificates, cohort assignments, discussions |
| **Recruiting / ATS** | Candidates, positions, public `/apply` form, n8n resume parser + comms |
| **Sales / Marketing / CEO / PM** | Leads, content repurposer, daily briefing, weekly status drafter |
| **Onboarding** | Onboarder records + n8n welcome / BG-check / 30-day / 90-day sequence |
| **Rates** | Per-user USD hourly rate with live FX conversion |

## Roles

`intern` · `ic` · `lead` · `admin`. ICs/interns land on `/my-tasks`; leads/admin on `/dashboard`.
Leads see extra tools gated by their team; admins see everything. See `src/lib/rbac.ts`.

## Getting started

```bash
npm install
cp .env.example .env     # fill in Supabase + the keys you need
npm run dev              # http://localhost:3000
```

Then seed accounts and (optionally) sample LMS content:

```bash
npx tsx scripts/seed-auth-users.ts   # Supabase Auth users for every public.users row (default pass Demo@1234)
npx tsx scripts/seed-lms.ts          # sample courses/lessons/quiz
```

### Common commands

```bash
npm run dev      # dev server
npm run build    # production build
npm run lint     # ESLint
npm run verify   # lint + build (pre-PR check)
npm test         # vitest

npx drizzle-kit generate   # create a migration after editing src/db/schema.ts
npx drizzle-kit migrate    # apply migrations
```

> If you see `Can't resolve 'tailwindcss'`, you're running from the parent `RS_Tools/` folder.
> `cd` into this repository root first.

## Configuration

All config is environment variables — see **`.env.example`** for the full annotated list.
Minimum to boot locally: the four `NEXT_PUBLIC_SUPABASE_*` / `SUPABASE_SERVICE_ROLE_KEY` /
`DATABASE_URL` values. `CRON_SECRET` is required for the auto-clock-out cron (and must match
the value configured in Vercel).

## Docs

| Doc | What it covers |
|-----|----------------|
| `docs/SETUP_AUDIT.md` | Current state of the repo + drift checklist |
| `docs/PLANE_DECOMMISSION_AUDIT.md` | Plane.so teardown |
| `docs/SUPABASE_AUDIT.md` | Supabase schema / migration audit |
| `docs/LMS_BUILD_PLAN.md` | LMS design |
| `docs/INTERNAL_PM_BUILD_PLAN.md` | In-app PM / tickets design |
| `docs/RECRUITMENT_AI_AGENT_BUILD_PLAN.md` | ATS / recruiting automation |
| `docs/INTERNAL_ONBOARDING_BUILD_PLAN.md` | Onboarding sequence |
| `docs/OVERTIME_AUTO_CLOCKOUT_AUDIT.md` | Attendance / overtime policy |
| `docs/design-system.md` | `--rs-` color tokens, fonts, utilities |

> `docs/TODO.md` and `docs/plan/*` describe the original Plane-based proposal and are kept for
> history only — they no longer reflect how the app works.
