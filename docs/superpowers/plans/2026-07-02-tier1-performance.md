# Tier 1 Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add missing DB indexes (full sweep), targeted `unstable_cache` read caching on slow-changing list data, and fix genuine query waterfalls — all additive, no new infra — per `docs/superpowers/specs/2026-07-02-tier1-performance-design.md`.

**Architecture:** Three independent streams. Stream A edits `src/db/schema.ts` and runs a Drizzle migration. Stream B fixes sequential-`await` DB calls in 4 read paths (research found 3 of the spec's original 7 candidate files have no real waterfall — see Task 11 for the audit trail). Stream C adds a new `src/lib/cache-tags.ts` tag registry, then wraps 4 read paths in `unstable_cache` and adds matching `revalidateTag` calls to their mutations.

**Tech Stack:** Next.js 16 (`unstable_cache`, `revalidateTag` from `next/cache`), Drizzle ORM (`index()` from `drizzle-orm/pg-core`), Supabase Postgres (service-role client).

---

## File structure

**New:**
- `src/lib/cache-tags.ts` — tag-string registry, single source of truth so read-side and write-side tags can't drift.

**Modified:**

| Stream | Files |
|---|---|
| A (indexes) | `src/db/schema.ts` |
| B (waterfalls) | `src/app/api/attendance/route.ts`, `src/app/api/onboarding/route.ts`, `src/app/(app)/admin/learning/[courseId]/roster/page.tsx` |
| C (caching) | `src/lib/lms.ts`, `src/app/(app)/admin/learning/page.tsx`, `src/app/(app)/admin/learning/actions.ts`, `src/app/(app)/recruiting/positions/page.tsx`, `src/app/apply/[positionId]/page.tsx`, `src/app/(app)/recruiting/positions/actions.ts`, `src/app/api/admin/users/route.ts`, `src/app/api/profile/me/route.ts` (combined B+C — see Task 9), `src/lib/tickets.ts`, `src/app/api/tickets/projects/[projectId]/labels/route.ts`, `.../labels/[labelId]/route.ts`, `.../cycles/route.ts`, `.../cycles/[cycleId]/route.ts` |

## Dependency graph (for parallel dispatch)

```
Task 1 (schema.ts indexes) ──→ Task 2 (generate + apply migration)
Task 3 (cache-tags.ts) ──┬──→ Task 7 (LMS caching)
                          ├──→ Task 8 (ATS caching)
                          ├──→ Task 9 (users list + profile/me combined)
                          └──→ Task 10 (project dropdowns caching)
Task 4 (attendance waterfall)   — fully independent
Task 5 (onboarding waterfall)   — fully independent
Task 6 (roster page waterfall)  — fully independent
Task 11 (verification) ──→ depends on ALL of: 2, 4, 5, 6, 7, 8, 9, 10
```

**Immediately parallel-dispatchable:** Tasks 1, 3, 4, 5, 6 (5 tracks, zero dependencies).
**After Task 3 lands:** Tasks 7, 8, 9, 10 (4 more tracks).
**After Task 1 lands:** Task 2.
**Last:** Task 11, once everything above is done.

**Why `profile/me/route.ts` is one combined task, not split across streams:** it's the only file both a waterfall fix (Task 4/5/6 candidate list) and a caching fix (Task 9) touch — GET needs the `Promise.all` merge, PUT needs the `revalidateTag` call. Splitting it across two parallel agents risks both editing the same file concurrently. It's handled entirely inside Task 9.

**Cache convention used throughout Stream C:** every `unstable_cache(...)` call uses `{ revalidate: 300, tags: [...] }` — a 5-minute safety-net TTL in addition to tag-based invalidation, so a missed `revalidateTag` call never causes indefinitely stale data.

---

## Task 1: DB indexes — schema.ts

**Files:** Modify `src/db/schema.ts`

`index` is already imported (line 2: `import { pgTable, text, integer, serial, jsonb, numeric, unique, boolean, index, primaryKey } from 'drizzle-orm/pg-core';`) — no import change needed.

**Skip list — do NOT add these, they're already covered.** A composite `unique()` constraint is itself a B-tree index, and Postgres can use its leftmost column(s) for filtering. These spec-requested indexes are redundant:
- `work_item_labels.work_item_id` — covered by `work_item_labels_unique` (workItemId, labelId). **Skip this table entirely.**
- `lms_certificates.user_id` — covered by `lms_certificates_user_course_unique` (userId, courseId). **Skip this table entirely.**
- `work_items.project_id` — covered by `work_items_project_seq_unique` (projectId, sequenceId). Still add `state_id`/`cycle_id` below.
- `project_members.project_id` — covered by `project_members_unique` (projectId, userId). Still add `user_id` below.
- `lms_lesson_completions.user_id` — covered by `lms_lesson_completions_user_lesson_unique` (userId, lessonId). Still add `lesson_id` below.
- `lms_course_assignments.user_id` — covered by `lms_course_assignments_user_course_unique` (userId, courseId). Still add `course_id` below.

- [ ] **Step 1: `timesheets` (schema.ts:50-65) — add new config array**

Current closing line `});` (line 65) becomes:
```ts
}, (t) => [
  index('timesheets_user_idx').on(t.userId),
]);
```

- [ ] **Step 2: `overtime_requests` (schema.ts:72-85) — add new config array**

Current closing `});` becomes:
```ts
}, (t) => [
  index('overtime_requests_user_idx').on(t.userId),
]);
```

- [ ] **Step 3: `timesheet_edit_requests` (schema.ts:91-108) — add new config array**

Current closing `});` becomes:
```ts
}, (t) => [
  index('timesheet_edit_requests_user_idx').on(t.userId),
  index('timesheet_edit_requests_timesheet_idx').on(t.timesheetId),
]);
```

- [ ] **Step 4: `attendance` (schema.ts:243-260) — add new config array**

Current closing `});` becomes:
```ts
}, (t) => [
  index('attendance_user_idx').on(t.userId),
]);
```

- [ ] **Step 5: `work_items` (schema.ts:298-317) — append to existing array**

Current array (lines 315-317):
```ts
}, (t) => [
  unique('work_items_project_seq_unique').on(t.projectId, t.sequenceId),
]);
```
becomes:
```ts
}, (t) => [
  unique('work_items_project_seq_unique').on(t.projectId, t.sequenceId),
  index('work_items_state_idx').on(t.stateId),
  index('work_items_cycle_idx').on(t.cycleId),
]);
```

- [ ] **Step 6: `work_item_assignees` (schema.ts:319-323) — add new config array**

Current closing `});` becomes:
```ts
}, (t) => [
  index('work_item_assignees_work_item_idx').on(t.workItemId),
  index('work_item_assignees_user_idx').on(t.userId),
]);
```

- [ ] **Step 7: `work_item_comments` (schema.ts:325-332) — add new config array**

Current closing `});` becomes:
```ts
}, (t) => [
  index('work_item_comments_work_item_idx').on(t.workItemId),
]);
```

- [ ] **Step 8: `work_item_activity` (schema.ts:361-369) — add new config array**

Current closing `});` becomes:
```ts
}, (t) => [
  index('work_item_activity_work_item_idx').on(t.workItemId),
]);
```

- [ ] **Step 9: `project_members` (schema.ts:351-359) — append to existing array**

Current array (lines 357-359):
```ts
}, (t) => [
  unique('project_members_unique').on(t.projectId, t.userId),
]);
```
becomes:
```ts
}, (t) => [
  unique('project_members_unique').on(t.projectId, t.userId),
  index('project_members_user_idx').on(t.userId),
]);
```

- [ ] **Step 10: `saved_views` (schema.ts:371-378) — add new config array**

Current closing `});` becomes:
```ts
}, (t) => [
  index('saved_views_user_idx').on(t.userId),
  index('saved_views_project_idx').on(t.projectId),
]);
```

- [ ] **Step 11: `lms_lessons` (schema.ts:404-416) — add new config array**

Current closing `});` becomes:
```ts
}, (t) => [
  index('lms_lessons_course_idx').on(t.courseId),
]);
```

- [ ] **Step 12: `lms_lesson_completions` (schema.ts:418-425) — append to existing array**

Current array (lines 423-425):
```ts
}, (t) => [
  unique('lms_lesson_completions_user_lesson_unique').on(t.userId, t.lessonId),
]);
```
becomes:
```ts
}, (t) => [
  unique('lms_lesson_completions_user_lesson_unique').on(t.userId, t.lessonId),
  index('lms_lesson_completions_lesson_idx').on(t.lessonId),
]);
```

- [ ] **Step 13: `lms_quiz_attempts` (schema.ts:448-457) — add new config array**

Current closing `});` becomes:
```ts
}, (t) => [
  index('lms_quiz_attempts_user_idx').on(t.userId),
  index('lms_quiz_attempts_quiz_idx').on(t.quizId),
]);
```

- [ ] **Step 14: `lms_course_assignments` (schema.ts:472-482) — append to existing array**

Current array (lines 480-482):
```ts
}, (t) => [
  unique('lms_course_assignments_user_course_unique').on(t.userId, t.courseId),
]);
```
becomes:
```ts
}, (t) => [
  unique('lms_course_assignments_user_course_unique').on(t.userId, t.courseId),
  index('lms_course_assignments_course_idx').on(t.courseId),
]);
```

- [ ] **Step 15: `lms_lesson_comments` (schema.ts:484-493) — add new config array**

Current closing `});` becomes:
```ts
}, (t) => [
  index('lms_lesson_comments_lesson_idx').on(t.lessonId),
  index('lms_lesson_comments_user_idx').on(t.userId),
]);
```

- [ ] **Step 16: `candidates` (schema.ts:144-191) — add new config array**

Current closing `});` (line 191) becomes:
```ts
}, (t) => [
  index('candidates_assigned_to_idx').on(t.assignedTo),
  index('candidates_created_by_idx').on(t.createdBy),
  index('candidates_status_idx').on(t.status),
]);
```

- [ ] **Step 17: `leads` (schema.ts:193-204) — add new config array**

Current closing `});` becomes:
```ts
}, (t) => [
  index('leads_assigned_to_idx').on(t.assignedTo),
  index('leads_stage_idx').on(t.stage),
]);
```

- [ ] **Step 18: Typecheck**

Run: `npm run lint`
Expected: no new errors (Drizzle's typed `(t) => [...]` callback form matches the existing `notifications`/`audit_log`/`presence_pings` pattern already in the file).

- [ ] **Step 19: Commit**

```bash
git add src/db/schema.ts
git commit -m "perf: add missing indexes on FK/filter columns across schema.ts"
```

---

## Task 2: DB indexes — generate + apply migration

**Depends on:** Task 1 committed.

**Files:** Creates a new file under `drizzle/` (name auto-assigned by drizzle-kit, next sequential number after the existing migrations).

- [ ] **Step 1: Generate the migration**

Run: `npx drizzle-kit generate`
Expected: a new `drizzle/00XX_<auto-name>.sql` file appears, containing only `CREATE INDEX` statements (one per index added in Task 1) — no `DROP`/`ALTER COLUMN`/table changes.

- [ ] **Step 2: Review the generated SQL**

Read the new file. Confirm every statement is `CREATE INDEX "..." ON "..." ("...");` and the index names match Task 1's naming (`<table>_<col>_idx`). If anything unexpected appears (a DROP, a column change), STOP — do not proceed to Step 3; something is wrong with schema.ts vs. the migration history and needs investigation before touching the live DB.

- [ ] **Step 3: STOP — confirm before applying to production**

This is a live Supabase Postgres database serving the running app. Even though `CREATE INDEX` is additive and low-risk, get an explicit go-ahead before running the next step against production — do not run it automatically as part of an unattended pipeline.

- [ ] **Step 4: Apply the migration**

Run: `npx drizzle-kit migrate`
Expected: output confirms the new migration applied successfully (uses `DATABASE_URL` from `.env`).

- [ ] **Step 5: Commit**

```bash
git add drizzle/
git commit -m "perf: apply index migration for FK/filter columns"
```

---

## Task 3: Cache tag registry

**Files:** Create `src/lib/cache-tags.ts`

- [ ] **Step 1: Write the file**

```ts
// Central registry of Next.js `unstable_cache` tag strings, so the read side
// (unstable_cache's `tags` option) and write side (`revalidateTag` calls in
// actions/routes) can't drift into mismatched strings.

export const LMS_COURSES_TAG = 'lms-courses';
export const ATS_POSITIONS_TAG = 'ats-positions';
export const USERS_LIST_TAG = 'users-list';

export function atsPositionTag(positionId: number | string): string {
  return `ats-position-${positionId}`;
}

export function projectStatesTag(projectId: number | string): string {
  return `project-${projectId}-states`;
}

export function projectLabelsTag(projectId: number | string): string {
  return `project-${projectId}-labels`;
}

export function projectCyclesTag(projectId: number | string): string {
  return `project-${projectId}-cycles`;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run lint`
Expected: no errors — pure new file, no other file imports it yet.

- [ ] **Step 3: Commit**

```bash
git add src/lib/cache-tags.ts
git commit -m "perf: add cache tag registry for unstable_cache targets"
```

---

## Task 4: Waterfall fix — api/attendance/route.ts

**Files:** Modify `src/app/api/attendance/route.ts`

This file's GET handler has two branches (month view, week view), each with independent DB calls currently run sequentially.

- [ ] **Step 1: Month branch — parallelize the independent calls**

Replace the month-branch sequence (currently: `teamUsersData` fetch, then `getPhotoResolver()`, then later separately `attendance` fetch, then later separately `timesheets` fetch — four calls, none actually dependent on another except `userIds` which is derived from `teamUsersData`) with:

```ts
const [{ data: teamUsersData }, resolvePhoto] = await Promise.all([
  usersQuery,
  getPhotoResolver(),
]);
const teamUsers = teamUsersData ?? [];
const userIds = teamUsers.map((u: { id: number }) => u.id);

const lastDayNum = new Date(Number(monthParam.split('-')[0]), Number(monthParam.split('-')[1]), 0).getDate();
const monthStart = `${monthParam}-01`;
const monthEnd   = `${monthParam}-${String(lastDayNum).padStart(2, '0')}`;

const [attendanceResult, timesheetResult] = await Promise.all([
  userIds.length > 0
    ? admin.from('attendance').select('*').in('user_id', userIds).in('week_start', mondays)
    : Promise.resolve({ data: [] as AttendanceRow[] }),
  userIds.length > 0
    ? admin.from('timesheets').select('user_id, duration_seconds')
        .in('user_id', userIds).gte('date', monthStart).lte('date', monthEnd).not('duration_seconds', 'is', null)
    : Promise.resolve({ data: [] as { user_id: number; duration_seconds: number }[] }),
]);
const records = (attendanceResult.data ?? []) as AttendanceRow[];
const workdays = countWorkdaysInMonth(monthParam);
const recordsByUserAndWeek = new Map(records.map(record => [`${record.user_id}:${record.week_start}`, record] as const));
```

Keep the existing `summary` construction (the `teamUsers.map(...)` block that builds `present`/`wfh`/`leave`/`absent`/`weekendWork` and reads `resolvePhoto(...)`) unchanged, but it now runs after both `Promise.all` batches instead of interleaved with the second fetch. After it, keep the existing `monthTsMap`/`summaryWithHours` construction unchanged (it already reads from `timesheetResult.data` in the new code — update any old reference from the previous `tsData`-style variable name to `timesheetResult.data`).

- [ ] **Step 2: Week branch — parallelize both independent batches**

Replace the week-branch sequence (7 sequential DB calls) with two batches: batch 1 is 3 mutually-independent calls (`rawRecords`, `teamUsers`, `photoResolver`); batch 2 (after `attEditorIds`/`userIds`/`weekDates` are derived from batch 1's results) is 4 more mutually-independent calls.

```ts
const weekParam = searchParams.get('week');
if (!weekParam) throw badRequest('week or month parameter required');
const weekStart = getMondayOfWeek(weekParam);
if (!weekStart) throw badRequest('week must be a Monday date (YYYY-MM-DD)');

let usersQuery = admin.from('users').select('id, name, email, team, role, member_code, hourly_rate_usd, approved_hours_per_week').eq('is_active', 1);
if (session.role !== 'admin') {
  usersQuery = usersQuery.eq('team', session.team ?? '');
}

const [{ data: rawRecordsData }, { data: teamUsersData2 }, resolvePhoto] = await Promise.all([
  admin.from('attendance').select('*').eq('week_start', weekStart),
  usersQuery,
  getPhotoResolver(),
]);
const rawRecords = rawRecordsData ?? [];
const teamUsers = teamUsersData2 ?? [];

const attEditorIds = [...new Set((rawRecords as AttendanceRow[])
  .map(r => r.edited_by)
  .filter((v): v is number => typeof v === 'number'))];

const weekDates: string[] = [];
const base = new Date(weekStart + 'T00:00:00');
for (let i = 0; i < 7; i++) {
  weekDates.push(toLocalISO(new Date(base.getTime() + i * 86400000)));
}
const userIds = (teamUsers as { id: number }[]).map(u => u.id);

const [editorsResult, tsResult, openResult, grantResult] = await Promise.all([
  attEditorIds.length > 0
    ? admin.from('users').select('id, name').in('id', attEditorIds)
    : Promise.resolve({ data: [] as { id: number; name: string }[] }),
  userIds.length > 0
    ? admin.from('timesheets').select('user_id, date, duration_seconds')
        .in('user_id', userIds).in('date', weekDates).not('duration_seconds', 'is', null)
    : Promise.resolve({ data: [] as { user_id: number; date: string; duration_seconds: number }[] }),
  userIds.length > 0
    ? admin.from('timesheets').select('user_id, clocked_in_at')
        .in('user_id', userIds).in('date', weekDates).is('clocked_out_at', null)
    : Promise.resolve({ data: [] as { user_id: number; clocked_in_at: string }[] }),
  userIds.length > 0
    ? admin.from('overtime_requests').select('user_id, granted_seconds')
        .in('user_id', userIds).eq('week_start', weekStart).eq('status', 'approved')
    : Promise.resolve({ data: [] as { user_id: number; granted_seconds: number | null }[] }),
]);

const attEditorNames: Record<number, string> = {};
for (const e of (editorsResult.data ?? []) as { id: number; name: string }[]) attEditorNames[e.id] = e.name;
```

Keep the existing `records`/`timesheetsByDay`/`openSessions`/`allowanceByUser`/`usersOut` construction unchanged, but update their source variables to `rawRecords`, `tsResult.data`, `openResult.data`, `grantResult.data` respectively (matching the batch-2 destructuring above) instead of whatever sequential variable names they previously read from.

- [ ] **Step 3: Typecheck**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, log in as admin, open `/attendance`, switch between month and week views, confirm the summary/records/hours display identically to before the change (spot-check a couple of users' present/absent/hours numbers against what you'd expect).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/attendance/route.ts
git commit -m "perf: parallelize independent DB reads in attendance route"
```

---

## Task 5: Waterfall fix — api/onboarding/route.ts

**Files:** Modify `src/app/api/onboarding/route.ts`

- [ ] **Step 1: Merge the org-profile lookup and the existing-user lookup**

Replace:
```ts
const orgProfile = await lookupOrgAuthProfileByEmail(email);
```
and the separate
```ts
const { data: existing } = await admin.from('users').select('id, role').eq('email', email).maybeSingle();
```
with:
```ts
const [orgProfile, existingResult] = await Promise.all([
  lookupOrgAuthProfileByEmail(email),
  admin.from('users').select('id, role').eq('email', email).maybeSingle(),
]);
const existing = existingResult.data;
```

Both calls only depend on `email`, not on each other's result — everything after this (the `if (!existing && !orgProfile)` branch and the update/upsert logic) is unchanged.

- [ ] **Step 2: Typecheck**

Run: `npm run lint`

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, exercise the onboarding POST flow (new-user path and existing-user path if both are reachable in dev) and confirm behavior is unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/onboarding/route.ts
git commit -m "perf: parallelize org-profile and existing-user lookups in onboarding route"
```

---

## Task 6: Waterfall fix — admin/learning/[courseId]/roster/page.tsx

**Files:** Modify `src/app/(app)/admin/learning/[courseId]/roster/page.tsx`

5 of the page's 6 queries only need the route's `id` param (or nothing); only `completions` depends on `lessonIds` (derived from `lessons`). This collapses to one 5-way batch plus one dependent call.

- [ ] **Step 1: Replace the sequential queries**

```tsx
const admin = createAdminClient();
const [
  { data: courseRow },
  { data: users },
  { data: lessons },
  { data: assigns },
  { data: certs },
] = await Promise.all([
  admin.from('lms_courses').select('*').eq('id', id).maybeSingle(),
  admin.from('users').select('id, name, email, team, role, is_active').eq('is_active', 1).order('name', { ascending: true }),
  admin.from('lms_lessons').select('id').eq('course_id', id),
  admin.from('lms_course_assignments').select('user_id, due_at').eq('course_id', id),
  admin.from('lms_certificates').select('user_id').eq('course_id', id),
]);
if (!courseRow) notFound();
const course: LmsCourse = {
  id: courseRow.id, title: courseRow.title, description: courseRow.description,
  scope: courseRow.scope as LmsScope, department: courseRow.department,
  coverImageUrl: courseRow.cover_image_url, isPublished: courseRow.is_published,
  enforcement: courseRow.enforcement as LmsEnforcement, sortOrder: courseRow.sort_order,
  createdAt: courseRow.created_at, updatedAt: courseRow.updated_at,
};

const lessonIds = ((lessons ?? []) as { id: number }[]).map(l => l.id);
const total = lessonIds.length;

const { data: completions } = total > 0
  ? await admin.from('lms_lesson_completions').select('user_id, lesson_id').in('lesson_id', lessonIds)
  : { data: [] as Array<{ user_id: number; lesson_id: number }> };
const completedByUser = new Map<number, number>();
for (const c of (completions ?? [])) {
  completedByUser.set(c.user_id, (completedByUser.get(c.user_id) ?? 0) + 1);
}

type ARow = { user_id: number; due_at: string | null };
const dueByUser = new Map<number, string | null>(
  ((assigns ?? []) as ARow[]).map(a => [a.user_id, a.due_at]),
);
const certifiedSet = new Set(((certs ?? []) as { user_id: number }[]).map(c => c.user_id));
```

The rest of the function (the `visibleUsers` filter and JSX render) is unchanged — it already consumes `course`, `users`, `completedByUser`, `dueByUser`, `certifiedSet`, `total` from local scope, which this rewrite still produces with the same names/shapes.

Note: `courseRow`/`users`/`lessons`/`assigns`/`certs` now all fetch even if `id` turns out to be invalid (the `notFound()` check moves after the batch instead of gating it). This is an admin-only, low-traffic page — the extra cost of 4 wasted cheap indexed queries on an invalid id is negligible.

- [ ] **Step 2: Typecheck**

Run: `npm run lint`

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, open an admin learning course's roster page (`/admin/learning/<courseId>/roster`), confirm the user list, completion counts, due dates, and certificate badges all render identically to before.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/admin/learning/[courseId]/roster/page.tsx"
git commit -m "perf: parallelize independent DB reads in learning roster page"
```

---

## Task 7: Caching — LMS course catalog

**Depends on:** Task 3.

**Files:** Modify `src/lib/lms.ts`, `src/app/(app)/admin/learning/page.tsx`, `src/app/(app)/admin/learning/actions.ts`

- [ ] **Step 1: `src/lib/lms.ts` — extract and cache the raw published-course fetch**

Add imports at the top (after the existing `createAdminClient`/`normalizeRole`/`computeQuizGate` imports):
```ts
import { unstable_cache } from 'next/cache';
import { LMS_COURSES_TAG } from '@/lib/cache-tags';
```

Replace the current `visibleCoursesFor` (lines 50-67):
```ts
export async function visibleCoursesFor(user: CourseAudience): Promise<LmsCourse[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('lms_courses')
    .select('id, title, description, scope, department, cover_image_url, is_published, enforcement, sort_order, created_at, updated_at')
    .eq('is_published', 1)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(`visibleCoursesFor: ${error.message}`);

  const all = (data ?? []).map(rowToCourse);
  const visible = all.filter(c => userInCourseAudience(c, user));
  const rank: Record<LmsScope, number> = { foundation: 0, intern: 1, department: 2 };
  return visible.sort((a, b) =>
    rank[a.scope] - rank[b.scope] || a.sortOrder - b.sortOrder
  );
}
```
with:
```ts
const getCachedPublishedCourseRows = unstable_cache(
  async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('lms_courses')
      .select('id, title, description, scope, department, cover_image_url, is_published, enforcement, sort_order, created_at, updated_at')
      .eq('is_published', 1)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`visibleCoursesFor: ${error.message}`);
    return data ?? [];
  },
  ['lms-published-courses'],
  { revalidate: 300, tags: [LMS_COURSES_TAG] },
);

export async function visibleCoursesFor(user: CourseAudience): Promise<LmsCourse[]> {
  const rows = await getCachedPublishedCourseRows();
  const all = rows.map(rowToCourse);
  const visible = all.filter(c => userInCourseAudience(c, user));
  const rank: Record<LmsScope, number> = { foundation: 0, intern: 1, department: 2 };
  return visible.sort((a, b) =>
    rank[a.scope] - rank[b.scope] || a.sortOrder - b.sortOrder
  );
}
```
(`rowToCourse` stays defined where it already is later in the file — unchanged, still used the same way.)

- [ ] **Step 2: `src/app/(app)/admin/learning/page.tsx` — cache just the `lms_courses` leg of the batch**

This page has `export const dynamic = 'force-dynamic'` (line 10) and joins fast-changing tables (`lms_lesson_completions`, `lms_course_assignments`) in the same `Promise.all` — only the `lms_courses` leg should be cached.

Add imports:
```tsx
import { unstable_cache } from 'next/cache';
import { LMS_COURSES_TAG } from '@/lib/cache-tags';
```

Add, above `export default async function AdminLearningPage()`:
```tsx
const getCachedAdminCourseRows = unstable_cache(
  async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('lms_courses')
      .select('id, title, scope, department, enforcement, is_published, created_at')
      .order('created_at', { ascending: false });
    if (error) throw new Error(`admin course list: ${error.message}`);
    return data ?? [];
  },
  ['lms-admin-course-rows'],
  { revalidate: 300, tags: [LMS_COURSES_TAG] },
);
```

Replace the `Promise.all` batch (lines 38-52):
```tsx
const [
  { data: courses },
  { data: users },
  { data: lessonRows },
  { data: assignRows },
  { data: completionRows },
] = await Promise.all([
  admin.from('lms_courses')
    .select('id, title, scope, department, enforcement, is_published, created_at')
    .order('created_at', { ascending: false }),
  admin.from('users').select('id, role, team').eq('is_active', 1),
  admin.from('lms_lessons').select('id, course_id'),
  admin.from('lms_course_assignments').select('course_id, user_id'),
  admin.from('lms_lesson_completions').select('user_id, lesson_id'),
]);
```
with:
```tsx
const [
  { data: courses },
  { data: users },
  { data: lessonRows },
  { data: assignRows },
  { data: completionRows },
] = await Promise.all([
  getCachedAdminCourseRows().then(data => ({ data })),
  admin.from('users').select('id, role, team').eq('is_active', 1),
  admin.from('lms_lessons').select('id, course_id'),
  admin.from('lms_course_assignments').select('course_id, user_id'),
  admin.from('lms_lesson_completions').select('user_id, lesson_id'),
]);
```
(`const admin = createAdminClient();` on line 35 stays — still used for the other 4 legs.)

- [ ] **Step 3: `src/app/(app)/admin/learning/actions.ts` — invalidate on mutation**

Change the import line (line 3):
```ts
import { revalidatePath } from 'next/cache';
```
to:
```ts
import { revalidatePath, revalidateTag } from 'next/cache';
```
Add, after the existing imports:
```ts
import { LMS_COURSES_TAG } from '@/lib/cache-tags';
```

In `createCourse`, after `revalidatePath('/admin/learning');` (line 49), add:
```ts
  revalidateTag(LMS_COURSES_TAG);
```

In `updateCourse`, after the three `revalidatePath(...)` calls (lines 72-74), add:
```ts
  revalidateTag(LMS_COURSES_TAG);
```

In `togglePublishCourse`, after the three `revalidatePath(...)` calls (lines 85-87), add:
```ts
  revalidateTag(LMS_COURSES_TAG);
```

In `deleteCourse`, after `revalidatePath('/admin/learning');` (line 95) and before `redirect('/admin/learning');` (line 96), add:
```ts
  revalidateTag(LMS_COURSES_TAG);
```

- [ ] **Step 4: Typecheck**

Run: `npm run lint`

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. As a learner, open `/learning` and confirm the course list renders. As an admin, open `/admin/learning`, create or edit a course, and confirm the change is visible immediately on both `/admin/learning` and `/learning` (proves `revalidateTag` is invalidating correctly, not just the 5-minute TTL papering over a broken invalidation).

- [ ] **Step 6: Commit**

```bash
git add src/lib/lms.ts "src/app/(app)/admin/learning/page.tsx" "src/app/(app)/admin/learning/actions.ts"
git commit -m "perf: cache LMS course catalog reads with tag-based invalidation"
```

---

## Task 8: Caching — ATS positions

**Depends on:** Task 3.

**Files:** Modify `src/app/(app)/recruiting/positions/page.tsx`, `src/app/apply/[positionId]/page.tsx`, `src/app/(app)/recruiting/positions/actions.ts`

- [ ] **Step 1: `src/app/(app)/recruiting/positions/page.tsx` — cache the listing query**

Add imports:
```tsx
import { unstable_cache } from 'next/cache';
import { ATS_POSITIONS_TAG } from '@/lib/cache-tags';
```

Add, above `export default async function PositionsPage()`:
```tsx
const getCachedPositionRows = unstable_cache(
  async () => {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('positions')
      .select('id, job_title, placement_type, location, compensation, employment_type, openings, job_description, is_open, created_at, created_by')
      .order('created_at', { ascending: false })
      .limit(200);
    return { data: data as Position[] | null, errorMessage: error?.message ?? null };
  },
  ['ats-position-rows'],
  { revalidate: 300, tags: [ATS_POSITIONS_TAG] },
);
```

Replace:
```tsx
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('positions')
    .select('id, job_title, placement_type, location, compensation, employment_type, openings, job_description, is_open, created_at, created_by')
    .order('created_at', { ascending: false })
    .limit(200);

  const errorMsg = error?.message;
```
with:
```tsx
  const supabase = createAdminClient();
  const { data, errorMessage } = await getCachedPositionRows();

  const errorMsg = errorMessage ?? undefined;
```
(The rest of the function — `tableMissing`, `unexpectedError`, `rawPositions`, the creator-name lookup using `supabase` — is unchanged; `supabase` is still needed and still created for that second, genuinely-dependent lookup.)

- [ ] **Step 2: `src/app/apply/[positionId]/page.tsx` — cache the per-position fetch with a dynamic tag**

Add imports:
```tsx
import { unstable_cache } from 'next/cache';
import { ATS_POSITIONS_TAG, atsPositionTag } from '@/lib/cache-tags';
```

Add, above `export default async function ApplyPage(...)`:
```tsx
async function getCachedPosition(id: number) {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('positions')
        .select('id, job_title, location, compensation, employment_type, openings, job_description, is_open')
        .eq('id', id)
        .maybeSingle();
      return { data: data as Position | null, errorMessage: error?.message ?? null };
    },
    ['ats-position-detail', String(id)],
    { revalidate: 300, tags: [ATS_POSITIONS_TAG, atsPositionTag(id)] },
  )();
}
```
(Wrapping inline per-call, closing over `id`, is required here — it's the only way to get a tag that varies per position; `unstable_cache`'s `tags` option is fixed at the point `unstable_cache(...)` is invoked, so a top-level module-scope wrapper can't produce per-id tags.)

Replace:
```tsx
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('positions')
    .select('id, job_title, location, compensation, employment_type, openings, job_description, is_open')
    .eq('id', id)
    .maybeSingle();

  if (error?.message?.toLowerCase().includes('does not exist')) {
    return <NotConfigured />;
  }
  if (!data) notFound();
```
with:
```tsx
  const { data, errorMessage } = await getCachedPosition(id);

  if (errorMessage?.toLowerCase().includes('does not exist')) {
    return <NotConfigured />;
  }
  if (!data) notFound();
```

- [ ] **Step 3: `src/app/(app)/recruiting/positions/actions.ts` — invalidate on mutation**

Change the import line (line 3):
```ts
import { revalidatePath } from 'next/cache';
```
to:
```ts
import { revalidatePath, revalidateTag } from 'next/cache';
```
Add:
```ts
import { ATS_POSITIONS_TAG, atsPositionTag } from '@/lib/cache-tags';
```

In `createPosition`, after `revalidatePath('/recruiting/positions');` (line 62), add:
```ts
  revalidateTag(ATS_POSITIONS_TAG);
```

In `updatePosition`, after `revalidatePath('/recruiting/positions');` (line 88), add:
```ts
  revalidateTag(ATS_POSITIONS_TAG);
  revalidateTag(atsPositionTag(id));
```

In `updatePositionStatus`, after `revalidatePath('/recruiting/positions');` (line 102), add:
```ts
  revalidateTag(ATS_POSITIONS_TAG);
  revalidateTag(atsPositionTag(id));
```

In `deletePosition`, after `revalidatePath('/recruiting/positions');` (line 113), add:
```ts
  revalidateTag(ATS_POSITIONS_TAG);
  revalidateTag(atsPositionTag(id));
```

- [ ] **Step 4: Typecheck**

Run: `npm run lint`

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. Open `/recruiting/positions`, and separately open `/apply/<a real positionId>`. Edit a position's title in `/recruiting/positions`, confirm it updates immediately both in the internal list and on the public `/apply/<id>` page (proves per-id tag invalidation works, not just the coarse list tag).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/recruiting/positions/page.tsx" "src/app/apply/[positionId]/page.tsx" "src/app/(app)/recruiting/positions/actions.ts"
git commit -m "perf: cache ATS positions reads with tag-based invalidation"
```

---

## Task 9: Caching — admin Users list + profile/me (combined B+C)

**Depends on:** Task 3.

**Files:** Modify `src/app/api/admin/users/route.ts`, `src/app/api/profile/me/route.ts`

This task owns **all** changes to `profile/me/route.ts` — both the GET waterfall merge and the PUT cache-invalidation — because it's the one file both Stream B and Stream C need to touch; keeping both edits in a single task avoids two parallel agents racing on the same file.

- [ ] **Step 1: `src/app/api/admin/users/route.ts` — cache the GET query**

Add imports (top of file, alongside the existing `NextResponse`/`createAdminClient`/etc. imports):
```ts
import { unstable_cache, revalidateTag } from 'next/cache';
import { USERS_LIST_TAG } from '@/lib/cache-tags';
```

Add, above `export const GET = route(...)`:
```ts
const getCachedUserRows = unstable_cache(
  async () => {
    const admin = createAdminClient();
    const { data } = await admin
      .from('users')
      .select('id, username, name, email, role, team, job_title, member_code, hourly_rate_usd, is_active, tool_access, date_of_birth, start_date, end_date, drive_url, approved_hours_per_week, schedule_pht_start, schedule_pht_end, setup_email_sent_at')
      .order('name');
    return data ?? [];
  },
  ['admin-user-rows'],
  { revalidate: 300, tags: [USERS_LIST_TAG] },
);
```

Replace the GET handler body:
```ts
export const GET = route(async () => {
  await requireAdmin();

  const admin = createAdminClient();
  const { data } = await admin
    .from('users')
    .select('id, username, name, email, role, team, job_title, member_code, hourly_rate_usd, is_active, tool_access, date_of_birth, start_date, end_date, drive_url, approved_hours_per_week, schedule_pht_start, schedule_pht_end, setup_email_sent_at')
    .order('name');
  const allUsers = data ?? [];
```
with:
```ts
export const GET = route(async () => {
  await requireAdmin();

  const allUsers = await getCachedUserRows();
```
(The `mapped = allUsers.map(...)` block and the final `return NextResponse.json({ users: mapped });` are unchanged.)

- [ ] **Step 2: POST handler — invalidate after successful create**

In the POST handler, after the `await recordAudit({...})` call (around line 297) and before the `return NextResponse.json({ user: { ... } }, { status: 201 });`, add:
```ts
    revalidateTag(USERS_LIST_TAG);
```

- [ ] **Step 3: PATCH handler — invalidate after successful update**

In the PATCH handler, after the audit block closes (around line 473, the `if (before) { ... }` block) and before the final `return NextResponse.json({ user: { ... } });`, add:
```ts
  revalidateTag(USERS_LIST_TAG);
```

- [ ] **Step 4: `src/app/api/profile/me/route.ts` — GET: merge into one Promise.all (waterfall fix)**

Replace:
```ts
export const GET = route(async () => {
  const session = await requireSession();

  const admin = createAdminClient();
  const { data: user } = await admin
    .from('users')
    .select('*')
    .eq('id', session.id)
    .maybeSingle();

  if (!user) throw notFound('User not found');

  const [{ data: teamRows }, { data: jobTitleRows }] = await Promise.all([
    admin.from('users').select('team').not('team', 'is', null).eq('is_active', 1),
    admin.from('users').select('job_title').not('job_title', 'is', null).eq('is_active', 1),
  ]);
```
with:
```ts
export const GET = route(async () => {
  const session = await requireSession();

  const admin = createAdminClient();
  const [{ data: user }, { data: teamRows }, { data: jobTitleRows }] = await Promise.all([
    admin.from('users').select('*').eq('id', session.id).maybeSingle(),
    admin.from('users').select('team').not('team', 'is', null).eq('is_active', 1),
    admin.from('users').select('job_title').not('job_title', 'is', null).eq('is_active', 1),
  ]);

  if (!user) throw notFound('User not found');
```
(Everything after — `availableTeams`, `availableJobTitles`, the final `NextResponse.json({...})` — is unchanged. Trade-off: a request for a since-deleted `session.id` now wastes 2 extra cheap queries before the 404 — negligible, `session` already implies a valid row in the overwhelming common case.)

- [ ] **Step 5: `src/app/api/profile/me/route.ts` — PUT: invalidate the Users-list cache**

Add imports at the top of the file:
```ts
import { revalidateTag } from 'next/cache';
import { USERS_LIST_TAG } from '@/lib/cache-tags';
```

In the PUT handler, after `await admin.from('users').update(payload).eq('id', session.id);` (line 125), add:
```ts
  revalidateTag(USERS_LIST_TAG);
```
This is required because a user editing their own profile writes to the same `users` table the admin Users list (Step 1 above) reads — without this, the admin list would silently serve stale data after any self-service profile edit.

- [ ] **Step 6: Typecheck**

Run: `npm run lint`

- [ ] **Step 7: Manual verification**

Run: `npm run dev`. As admin, open the Users management table, edit a user's team via the admin PATCH path — confirm the list updates. Separately, log in as a non-admin user, edit your own profile (name/team) via `/profile` — then, as admin, reload the Users list and confirm the change shows up (this is the cross-cutting case Step 5 fixes — verify it actually works, don't just trust the code).

- [ ] **Step 8: Commit**

```bash
git add src/app/api/admin/users/route.ts src/app/api/profile/me/route.ts
git commit -m "perf: cache admin users list, parallelize profile reads, fix cross-write cache invalidation"
```

---

## Task 10: Caching — project dropdowns (states/labels/cycles/members)

**Depends on:** Task 3.

**Files:** Modify `src/lib/tickets.ts`, `src/app/api/tickets/projects/[projectId]/labels/route.ts`, `.../labels/[labelId]/route.ts`, `.../cycles/route.ts`, `.../cycles/[cycleId]/route.ts`

- [ ] **Step 1: `src/lib/tickets.ts` — add imports**

After the existing imports (`createAdminClient`, `mapOrgDeptToAppTeam`):
```ts
import { unstable_cache } from 'next/cache';
import { projectStatesTag, projectLabelsTag, projectCyclesTag, USERS_LIST_TAG } from '@/lib/cache-tags';
```

- [ ] **Step 2: `getProjectStates` (tickets.ts:150-159) — wrap in unstable_cache**

Replace:
```ts
export async function getProjectStates(projectId: string): Promise<PlaneState[]> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from('project_states')
    .select('id, name, group, color, sequence')
    .eq('project_id', Number(projectId))
    .order('sequence');
  if (error) throw new PlaneApiError(500, `states/${projectId}`);
  return (data ?? []).map(mapState);
}
```
with:
```ts
export async function getProjectStates(projectId: string): Promise<PlaneState[]> {
  const rows = await unstable_cache(
    async () => {
      const sb = createAdminClient();
      const { data, error } = await sb
        .from('project_states')
        .select('id, name, group, color, sequence')
        .eq('project_id', Number(projectId))
        .order('sequence');
      if (error) throw new PlaneApiError(500, `states/${projectId}`);
      return data ?? [];
    },
    ['project-states', projectId],
    { revalidate: 300, tags: [projectStatesTag(projectId)] },
  )();
  return rows.map(mapState);
}
```
(No mutation function exists for `project_states` in this file today — states are fixed at project creation — so there's no invalidation call site to add anywhere; the 5-minute TTL is the only staleness bound. This is intentional, not an oversight.)

- [ ] **Step 3: `getWorkspaceMembers` (tickets.ts:161-175) — wrap, share the Users-list tag**

Replace:
```ts
export async function getWorkspaceMembers(): Promise<PlaneMember[]> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from('users')
    .select('id, name, email')
    .eq('is_active', 1);
  if (error) throw new PlaneApiError(500, 'members');
  return (data ?? []).map((u: Row) => ({
    id: String(u.id),
    display_name: String(u.name),
    email: String(u.email ?? ''),
  }));
}
```
with:
```ts
export async function getWorkspaceMembers(): Promise<PlaneMember[]> {
  const rows = await unstable_cache(
    async () => {
      const sb = createAdminClient();
      const { data, error } = await sb
        .from('users')
        .select('id, name, email')
        .eq('is_active', 1);
      if (error) throw new PlaneApiError(500, 'members');
      return data ?? [];
    },
    ['workspace-members'],
    { revalidate: 300, tags: [USERS_LIST_TAG] },
  )();
  return rows.map((u: Row) => ({
    id: String(u.id),
    display_name: String(u.name),
    email: String(u.email ?? ''),
  }));
}
```
Sharing `USERS_LIST_TAG` (from Task 9) means any user create/update/self-edit also invalidates the assignee-dropdown list — no separate invalidation wiring needed here.

- [ ] **Step 4: `getLabels` (tickets.ts:571-582) — wrap in unstable_cache**

Replace:
```ts
export async function getLabels(projectId: string): Promise<Label[]> {
  const sb = createAdminClient();
  const { data, error } = await sb.from('labels')
    .select('id, project_id, name, color')
    .eq('project_id', Number(projectId))
    .order('name');
  if (error) throw new PlaneApiError(500, `labels/${projectId}`);
  return (data ?? []).map((r: Row) => ({
    id: Number(r.id), project_id: Number(r.project_id),
    name: String(r.name), color: String(r.color),
  }));
}
```
with:
```ts
export async function getLabels(projectId: string): Promise<Label[]> {
  const rows = await unstable_cache(
    async () => {
      const sb = createAdminClient();
      const { data, error } = await sb.from('labels')
        .select('id, project_id, name, color')
        .eq('project_id', Number(projectId))
        .order('name');
      if (error) throw new PlaneApiError(500, `labels/${projectId}`);
      return data ?? [];
    },
    ['project-labels', projectId],
    { revalidate: 300, tags: [projectLabelsTag(projectId)] },
  )();
  return rows.map((r: Row) => ({
    id: Number(r.id), project_id: Number(r.project_id),
    name: String(r.name), color: String(r.color),
  }));
}
```
(`createLabel`/`deleteLabel` in this same file are unchanged — invalidation is added at the route-handler call sites in Steps 6-7 below, not inside these library functions, since `revalidateTag` is a Next.js-specific call and this file is otherwise framework-agnostic server-side data access.)

- [ ] **Step 5: `getCycles` (tickets.ts:853-866) — wrap in unstable_cache**

Replace:
```ts
export async function getCycles(projectId: string): Promise<Cycle[]> {
  const sb = createAdminClient();
  const { data, error } = await sb.from('cycles')
    .select('id, project_id, name, start_date, end_date, archived')
    .eq('project_id', Number(projectId))
    .eq('archived', 0)
    .order('start_date', { ascending: false });
  if (error) throw new PlaneApiError(500, `cycles/${projectId}`);
  return (data ?? []).map((r: Row) => ({
    id: Number(r.id), project_id: Number(r.project_id),
    name: String(r.name), start_date: String(r.start_date),
    end_date: String(r.end_date), archived: Number(r.archived ?? 0),
  }));
}
```
with:
```ts
export async function getCycles(projectId: string): Promise<Cycle[]> {
  const rows = await unstable_cache(
    async () => {
      const sb = createAdminClient();
      const { data, error } = await sb.from('cycles')
        .select('id, project_id, name, start_date, end_date, archived')
        .eq('project_id', Number(projectId))
        .eq('archived', 0)
        .order('start_date', { ascending: false });
      if (error) throw new PlaneApiError(500, `cycles/${projectId}`);
      return data ?? [];
    },
    ['project-cycles', projectId],
    { revalidate: 300, tags: [projectCyclesTag(projectId)] },
  )();
  return rows.map((r: Row) => ({
    id: Number(r.id), project_id: Number(r.project_id),
    name: String(r.name), start_date: String(r.start_date),
    end_date: String(r.end_date), archived: Number(r.archived ?? 0),
  }));
}
```

- [ ] **Step 6: `labels/route.ts` — invalidate on create**

Add import:
```ts
import { revalidateTag } from 'next/cache';
import { projectLabelsTag } from '@/lib/cache-tags';
```
In the `POST` handler, after `return NextResponse.json(await createLabel(projectId, name, body.color ?? '#6b7280'));` — restructure to invalidate before returning:
```ts
  try {
    const label = await createLabel(projectId, name, body.color ?? '#6b7280');
    revalidateTag(projectLabelsTag(projectId));
    return NextResponse.json(label);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
```

- [ ] **Step 7: `labels/[labelId]/route.ts` — invalidate on delete**

Add import:
```ts
import { revalidateTag } from 'next/cache';
import { projectLabelsTag } from '@/lib/cache-tags';
```
Replace the `DELETE` handler body:
```ts
  try {
    await deleteLabel(labelId);
    return NextResponse.json({ ok: true });
  } catch (err) {
```
with:
```ts
  try {
    await deleteLabel(labelId);
    revalidateTag(projectLabelsTag(projectId));
    return NextResponse.json({ ok: true });
  } catch (err) {
```
(`projectId` is already destructured from `ctx.params` earlier in this handler.)

- [ ] **Step 8: `cycles/route.ts` — invalidate on create**

Add import:
```ts
import { revalidateTag } from 'next/cache';
import { projectCyclesTag } from '@/lib/cache-tags';
```
Replace the `POST` handler's try block:
```ts
  try {
    return NextResponse.json(
      await createCycle(projectId, name, body.startDate, body.endDate),
    );
  } catch (err) {
```
with:
```ts
  try {
    const cycle = await createCycle(projectId, name, body.startDate, body.endDate);
    revalidateTag(projectCyclesTag(projectId));
    return NextResponse.json(cycle);
  } catch (err) {
```

- [ ] **Step 9: `cycles/[cycleId]/route.ts` — invalidate on update and delete**

Add import:
```ts
import { revalidateTag } from 'next/cache';
import { projectCyclesTag } from '@/lib/cache-tags';
```
In `PATCH`, replace:
```ts
  try {
    await updateCycle(cycleId, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
```
with:
```ts
  try {
    await updateCycle(cycleId, body);
    revalidateTag(projectCyclesTag(projectId));
    return NextResponse.json({ ok: true });
  } catch (err) {
```
In `DELETE`, replace:
```ts
  try {
    await deleteCycle(cycleId);
    return NextResponse.json({ ok: true });
  } catch (err) {
```
with:
```ts
  try {
    await deleteCycle(cycleId);
    revalidateTag(projectCyclesTag(projectId));
    return NextResponse.json({ ok: true });
  } catch (err) {
```
(`projectId` is already destructured from `ctx.params` in both handlers.)

- [ ] **Step 10: Typecheck**

Run: `npm run lint`

- [ ] **Step 11: Manual verification**

Run: `npm run dev`. Open a project board, create a label and a cycle, confirm both appear immediately in the relevant dropdowns/filters without a hard refresh being required (proves tag invalidation, not just eventual TTL expiry). Delete the label and cycle, confirm they disappear immediately too.

- [ ] **Step 12: Commit**

```bash
git add src/lib/tickets.ts "src/app/api/tickets/projects/[projectId]/labels/route.ts" "src/app/api/tickets/projects/[projectId]/labels/[labelId]/route.ts" "src/app/api/tickets/projects/[projectId]/cycles/route.ts" "src/app/api/tickets/projects/[projectId]/cycles/[cycleId]/route.ts"
git commit -m "perf: cache project states/labels/cycles/members reads with tag-based invalidation"
```

---

## Task 11: Final verification

**Depends on:** Tasks 2, 4, 5, 6, 7, 8, 9, 10 all complete.

- [ ] **Step 1: Record the waterfall audit trail**

Three of the spec's original 7 candidate files turned out, on inspection, to have no genuine parallelization opportunity — every DB call in them is either a single query or is data/auth-dependent on the prior call:
- `src/app/api/admin/timesheets/route.ts` — permission-check chain (`targetUser` → auth gate → `tsData` → `editors`), each step depends on the last.
- `src/app/api/admin/users/route.ts` GET — single query (it does get a caching change in Task 9, just not a waterfall fix).
- `src/app/api/weekly-report/route.ts` — GET is a single query; POST is a check-then-act upsert that needs `existing` resolved before deciding insert vs. update.

No code change needed for these three on the waterfall front — this step is just confirming that finding is recorded (it already is, in this plan's Task list above and in the design spec discussion) so it isn't mistaken for an oversight later.

- [ ] **Step 2: Run the full verification suite**

Run: `npm run verify`
Expected: lint + build both pass with no errors.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: all pass, including `supabase-write-columns.test.ts` (confirms none of the `.update()`/`.insert()` payloads touched in Tasks 4-10 introduced a column-name mismatch).

- [ ] **Step 4: Manual click-through**

Run: `npm run dev`. Walk through: `/attendance` (month + week views), `/admin/users` (edit a user, confirm list updates), `/learning` + `/admin/learning` (view + edit a course), `/recruiting/positions` + a live `/apply/<id>` link (edit a position, confirm both update), a project board (create/delete a label and cycle). Confirm every page behaves identically to before this plan — same data, same numbers — just without any visible regression.

- [ ] **Step 5: Final commit (if Step 4 required any fixes)**

Only if manual verification surfaced an issue requiring a code fix:
```bash
git add -A
git commit -m "perf: fix issue found during Tier 1 verification pass"
```
If no fixes were needed, no commit here — the plan is complete as of Task 10's commit.
