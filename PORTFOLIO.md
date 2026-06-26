# Romega Ops Platform

> Internal operations platform for a software/recruiting agency — PM & ticketing, attendance, an LMS, an applicant-tracking system, and automated onboarding, all in one Next.js app on Supabase.

**Role:** Full-stack design & build (solo) · **Status:** In production · **Year:** 2026

| | |
|---|---|
| **Stack** | Next.js 16 (App Router, React 19) · Supabase (Postgres + Auth + Storage) · Drizzle ORM · Tailwind v4 · TypeScript |
| **Integrations** | n8n (16 workflows) · Groq LLM · Wise FX API · Google OAuth |
| **Scale** | 51 pages · 62 API routes · 36 Postgres tables |
| **Deploy** | Vercel (daily cron jobs) |

---

## The problem

The agency was paying for and stitching together several disconnected SaaS tools — a project tracker (Plane.so), spreadsheets for attendance and overtime, a separate LMS, and ad-hoc recruiting. Data lived in silos, nobody had a single source of truth, and "who's clocked in / who's overdue on a task / which candidate is stuck" meant checking four different places.

The platform started life as a thin reporting layer **on top of** Plane.so. I decommissioned that dependency entirely and rebuilt it as the system of record: it now **owns** the PM/ticketing data, attendance, learning, recruiting, and onboarding — one login, one design system, one database.

---

## What it does

Seven product areas, each a real working module — not a demo:

### 🗂 Project management & ticketing
A built-from-scratch replacement for Plane.so: projects, work items, cycles (sprints), labels, comments, an activity feed, and saved views. Drag-and-drop **kanban board** (`@dnd-kit`), a resizable task-detail panel, rich-text descriptions with inline image upload (Tiptap), and `@mention` notifications that fire in-app alerts.

### ⏱ Attendance & timesheets
Clock in/out with live presence ("who's in" panel), a **weekly 15-hour overtime engine** with a hard cap, admin approval queue for overtime grants (30 min / 1 h / 2 h extensions), self-service time-edit requests with team-lead approval, and an automated **auto-clock-out cron** that closes forgotten sessions nightly.

### 🎓 Learning management (LMS)
Courses → lessons → quizzes, with **server-graded** quizzes (answers never leave the server), sequential progression locks, markdown lesson content with safe autolinking, cohort assignments, discussions, an enforcement gate, and **auto-generated PDF certificates** (`pdf-lib`) with serialized numbering.

### 🧑‍💼 Recruiting / ATS
Candidates and positions with a rich JD editor, a **public job-application form** (no auth), an n8n-powered résumé parser, automated candidate communication, an unresponsive-applicant sweep, and a GDPR consent gate in front of the public talent pool.

### 📊 Reports, Sales, Marketing & CEO tools
Weekly status reports with **Excel export** (`exceljs`), a Groq-powered **CEO daily briefing**, a weekly **status drafter**, a content repurposer, sales leads, and live **USD→PHP currency conversion** via the Wise API for per-user hourly rates.

### 🚀 Onboarding
A fully automated new-hire sequence orchestrated through n8n: welcome → background check → employment/reference verification → Gmail-signature nudge → group-chat announcement → 30-day check-in → 90-day review.

### 🔐 Admin & access control
Per-user **Tool Access matrix** (checkbox RBAC) layered on four normalized roles (intern / IC / lead / admin), user management with soft-deactivation and an activity feed, and an in-app setup/guide wizard.

---

## Architecture

```
            ┌─────────────────────────── Next.js 16 (App Router) ──────────────────────────┐
            │  ~51 pages (RBAC-gated route group)   ·   ~62 API route handlers              │
            └───────────────┬──────────────────────────────────────────────┬───────────────┘
                            │                                               │
              ┌─────────────▼─────────────┐                   ┌─────────────▼─────────────┐
              │  Supabase                 │                   │  External services        │
              │  • Postgres (36 tables)   │                   │  • n8n  (16 workflows)    │
              │  • Auth (Google OAuth)    │                   │  • Groq (LLM features)    │
              │  • Storage (signed URLs)  │                   │  • Wise (live FX)         │
              └───────────────────────────┘                   └───────────────────────────┘
                            ▲
              Drizzle ORM (schema.ts = single source of truth) · postgres-js over pgBouncer pooler

   Vercel cron ──► /api/cron/auto-clock-out   ·   /api/cron/task-due-reminders
```

**Key decisions**

- **Schema-first database.** `src/db/schema.ts` is the single source of truth; Drizzle migrations are derived artifacts. Non-table objects (RPC functions, storage buckets, RLS, triggers) live in separate, named SQL migrations that Drizzle can't model.
- **Auth that the proxy doesn't fully cover.** Supabase SSR sessions in `sb-*` cookies; a middleware-equivalent `proxy.ts` refreshes sessions and guards pages — but deliberately **excludes `/api`**, so every route handler authenticates itself via `getSession()`. Documented as a sharp edge so it's never forgotten.
- **RBAC as data, not code.** Four roles are normalized from a dozen messy DB strings (`"ceo"`, `"tl"`, `"manager"`…), then refined by a per-user `tool_access` JSONB matrix — admins bypass, everyone else is gated at both the page and action level.
- **Automation offloaded to n8n.** Anything that's a scheduled side-effect (résumé parsing, onboarding emails, attendance sweeps, the CEO briefing) is an n8n workflow triggered by webhook, keeping the app stateless and the cron surface small.

---

## Engineering highlights

- **Replaced a third-party SaaS dependency in place** — migrated from "reporting layer on Plane.so" to a self-owned PM system without losing the team's data or workflow.
- **A real overtime policy engine** (`lib/overtime-policy.ts`): weekly 15 h budget, no per-day cap, OT defined as time beyond the budget, a 16 h ceiling, admin-gated bounded extensions, and a Clock-In button that hard-disables at the cap. Policy evolved through several production iterations — encoded in one tested module, not scattered through the UI.
- **Server-authoritative LMS grading & certificates** — quiz answers are graded server-side, progression is locked until completion, and certificates are generated as real PDFs with serialized IDs from a Postgres sequence.
- **Self-healing user registration** — detects orphaned Supabase auth accounts (an `auth.users` row with no `public.users` row) and adopts them on the next registration instead of throwing "email already exists."
- **Live infrastructure probing** — because the pooler connection can drift, schema changes are verified against the running database with service-role head-probes before relying on a column existing.

---

## Tech stack

| Layer | Choices |
|-------|---------|
| **Framework** | Next.js 16 · React 19 · TypeScript · App Router + Server Components |
| **Data** | Supabase Postgres · Drizzle ORM · `postgres-js` (pgBouncer-safe) |
| **Auth** | Supabase Auth + Google OAuth · legacy bcrypt path · custom RBAC |
| **UI** | Tailwind v4 · shadcn/ui on Base UI · `lucide-react` · Recharts · `@dnd-kit` · Tiptap |
| **Docs/Export** | `exceljs` (Excel) · `pdf-lib` (certificates) · `react-markdown` + `remark-gfm` |
| **AI / automation** | Groq LLM · n8n (16 workflows) · Wise FX API |
| **Quality** | ESLint · Vitest · `npm run verify` (lint + build) pre-PR gate |
| **Hosting** | Vercel · daily cron jobs |

---

## Design system

A shared **Romega Solutions** brand system: `--rs-`-prefixed CSS custom properties (primary blue `hsla(209,100%,45%)`, accent orange, blue-tinted neutrals), Merriweather for headings and Source Sans 3 for body, mapped into Tailwind v4's `@theme` so shadcn tokens resolve correctly.

---

*Single source of truth for the live numbers in this document: `src/db/schema.ts` (tables), `src/app/(app)/` (pages), and `src/app/api/` (routes).*
