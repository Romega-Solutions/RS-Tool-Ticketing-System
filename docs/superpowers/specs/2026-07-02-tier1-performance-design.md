# Design: Tier 1 performance — DB indexes, targeted read caching, waterfall fixes

**Date:** 2026-07-02
**Status:** Approved — implementing

## Problem

The app was being evaluated for a Redis/Upstash caching layer to "make it faster." A
code audit found that's the wrong first move: there's no traffic-scale problem here,
and a shared cache wouldn't fix the actual sources of latency. What's real:

1. **No indexes on foreign-key / hot-filter columns.** Postgres does not auto-index
   FK columns (only the PK). `work_items.project_id` — filtered on every board load —
   has no index. Neither do most other FK columns across the PM, LMS, and attendance
   tables. Three tables (`presence_pings`, `audit_log`, `notifications`) already have
   indexes and set the pattern to follow.
2. **No read caching on slow-changing reference/list data.** The only cached reads in
   the app today are the FX rate (`api/fx/usd-php`, 60s in-process TTL) and org-chart
   photos (`lib/orgchart.ts`, 5-minute in-process TTL). Lists like the LMS course
   catalog or ATS positions are re-queried from Supabase on every request even though
   they change rarely.
3. **A handful of read paths issue sequential (non-`Promise.all`'d) DB calls** that
   could run concurrently.

Two things already work correctly and need no change: `getSession()` is wrapped in
React `cache()` (`src/lib/session.ts`), and the `projects/[id]` board /
`getWorkItems()` path already uses a single embedded-select query plus `Promise.all`.

## Goals

1. Add indexes for FK/hot-filter columns across the schema (full sweep).
2. Add `unstable_cache`-backed read caching for genuinely slow-changing list/reference
   data, invalidated via `revalidateTag()` alongside existing `revalidatePath()` calls.
3. Fix the specific read-path query waterfalls identified below.

## Non-goals

- **Redis / Upstash / any new cache infra.** Not justified at this traffic scale; the
  wins above are free and address the actual bottlenecks. Revisit only if a concrete
  distributed-state need shows up (see below).
- **Enabling Next 16 Cache Components** (`cacheComponents`/`dynamicIO`, the `'use
  cache'` directive). Not currently on in `next.config.ts`. Turning it on is an
  app-wide rendering-mode change — every dynamic API read needs a Suspense boundary —
  and is a separate, much riskier project, not a "free" Tier 1 win.
- **`lib/presence.ts`'s in-memory state** (online users, SSE subscriber maps, pings).
  This is a correctness issue (state doesn't sync across Vercel serverless instances),
  not a Tier 1 perf item. Flagged as a follow-up candidate for Supabase Realtime — out
  of scope here.
- Rewriting write-path (`actions.ts`) sequential-await chains. Lower priority (affects
  save latency, not page load); left for a future pass unless trivial to fold in.

## 1. DB indexes (full sweep)

**Mechanism:** add `index(...)` entries to `src/db/schema.ts` using the same pattern
already used for `notifications`/`audit_log`/`presence_pings`, then
`npx drizzle-kit generate` + `npx drizzle-kit migrate` — the project's existing,
canonical migration workflow. Purely additive (`CREATE INDEX`, no drops/renames), one
migration file. Applied via standard `drizzle-kit migrate` (not
`CREATE INDEX CONCURRENTLY`) — acceptable lock duration at this table size/traffic.

**Target columns** (no index today):

| Table | Columns |
|---|---|
| `timesheets` | `user_id` |
| `overtime_requests` | `user_id` |
| `timesheet_edit_requests` | `user_id`, `timesheet_id` |
| `attendance` | `user_id` |
| `work_items` | `project_id`, `state_id`, `cycle_id` |
| `work_item_assignees` | `work_item_id`, `user_id` |
| `work_item_comments` | `work_item_id` |
| `work_item_labels` | `work_item_id` |
| `work_item_activity` | `work_item_id` |
| `project_members` | `project_id`, `user_id` (backs `projectCaps()`, called on every project-page permission check) |
| `saved_views` | `user_id`, `project_id` |
| `lms_lessons` | `course_id` |
| `lms_lesson_completions` | `user_id`, `lesson_id` |
| `lms_quiz_attempts` | `user_id`, `quiz_id` |
| `lms_certificates` | `user_id` |
| `lms_course_assignments` | `user_id`, `course_id` |
| `lms_lesson_comments` | `lesson_id`, `user_id` |
| `candidates` | `assigned_to`, `created_by`, `status` |
| `leads` | `assigned_to`, `stage` |

**Caveat — `positions` table:** per `CLAUDE.md`'s history note and prior drift
findings, the ATS `positions` table (and a few others: onboarders, ATS-history) exist
in the live Supabase DB but are **not modeled in `schema.ts`**, so `drizzle-kit
generate` cannot emit an index for them. If `positions` needs an index (e.g. on
`status`), it has to go through the `docs/migrations/*.sql` raw-SQL path used for
other non-Drizzle-managed objects — out of scope for the mechanism in this spec.
Flagged here so it isn't silently dropped; can be picked up as a fast-follow.

## 2. Targeted read caching

**Mechanism:** `unstable_cache` (stable Next 16 API), not the module-level TTL-object
pattern used for FX/org-chart. That pattern only suits external-API mirrors — it's
per-serverless-instance memory, doesn't survive across instances, and doesn't give
clean write-triggered invalidation for DB-backed lists. `unstable_cache` does, via
`revalidateTag()`.

**Targets** (read often, change rarely):

- LMS course catalog listing (`learning` + `admin/learning` course lists)
- ATS positions listing (`recruiting` + public `/apply`)
- Admin Users list
- Project dropdown lookups: states, labels, cycles

**Invalidation:** add `revalidateTag(<tag>)` calls into the corresponding existing
`actions.ts` mutations, right alongside the `revalidatePath()` calls already there —
no new invalidation plumbing, just an added call per mutation.

## 3. Query waterfall fixes

Convert independent sequential `await` DB calls to `Promise.all` in these **read**
paths (identified by grepping for 2+ sequential `await admin.from(...)` /
`await supabase.from(...)` calls with no `Promise.all` in the same file):

- `src/app/api/attendance/route.ts`
- `src/app/api/admin/timesheets/route.ts`
- `src/app/api/admin/users/route.ts`
- `src/app/api/weekly-report/route.ts`
- `src/app/api/onboarding/route.ts`
- `src/app/api/profile/me/route.ts`
- `src/app/(app)/admin/learning/[courseId]/roster/page.tsx`

Each file needs a quick read to confirm which calls are genuinely independent
(parallelizable) vs. sequentially dependent (e.g., a permission check that must
resolve before the data query) — only the former get wrapped in `Promise.all`.

**Explicitly not touched:** `projects/[id]/page.tsx` and `getWorkItems()` — already
optimized (single embedded-select + `Promise.all`).

## Testing / verification

- `npm run verify` (lint + build) after schema/migration changes.
- `npm test` (vitest) — including the existing `supabase-write-columns.test.ts` guard,
  to confirm no payload/column drift was introduced.
- Manual click-through, pre/post, on: attendance, admin/users, learning
  (catalog + a lesson), recruiting (positions list + `/apply`) — confirm identical
  behavior, just faster. No automated perf assertions; this is a manual spot-check.

## Rollout

Single branch, commits split by concern (indexes migration; waterfall fixes; caching +
`revalidateTag` wiring) so each is independently reviewable/revertable.
