# Project-Level Comments — Design

- **Date:** 2026-07-03
- **Status:** Approved
- **Area:** Internal PM/ticketing (`projects/[id]`), notifications

---

## Problem

Comments today only exist on individual work items (`work_item_comments`, shipped
2026-06-20 as part of Notifications + @mentions). There is no way to discuss
something that concerns the whole project — a general update, an announcement,
an unresolved cross-cutting issue — without hijacking an unrelated task's thread
or making up a placeholder task just to hold a conversation.

This adds a second, independent comment surface scoped to the **project**
instead of a work item, so project members can talk about the project itself.

## Goals

1. A "Discussion" surface per project where any project member (viewer/member/
   lead) or admin can post rich-text comments with @mentions, exactly like task
   comments today.
2. @mentions in a project comment notify the tagged teammate via the existing
   notification bell, deep-linking straight to the comment.
3. Same delete permission model as task comments: author or admin.

## Non-goals (YAGNI)

- Changing anything about existing task/work-item comments.
- A generalized/polymorphic comments system spanning multiple entity types.
- Real-time sync (task comments are fetch-on-open today; project comments match).
- In-UI comment editing (task comments only expose delete today; project
  comments match — the PATCH route exists for symmetry but the UI won't call it).
- A "someone posted" notification to every member — only @mentions notify,
  matching task-comment behavior.
- Project-level activity-log entries (`work_item_activity` is work-item scoped;
  nothing reads a project-scoped equivalent today).

---

## Data model

New table, mirroring `work_item_comments` exactly:

```ts
export const projectComments = pgTable('project_comments', {
  id:         serial('id').primaryKey(),
  projectId:  integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  authorId:   integer('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body:       text('body').notNull(),
  createdAt:  text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt:  text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index('project_comments_project_idx').on(t.projectId),
]);
```

Rejected alternatives: a single polymorphic `comments` table, or loosening
`work_item_comments` to accept a null work item + a project id. Both require
migrating the live, shipped `work_item_comments` table and an "exactly one of
X/Y" invariant, for a stylistic win — this codebase already keeps comment
surfaces as separate tables (`work_item_comments`, `lms_lesson_comments`), so a
third dedicated table matches convention and carries zero risk to the existing
feature.

### RLS (required, not optional)

The 2026-07-01 lockdown (`docs/migrations/enable-rls-all-public-tables.sql`)
enabled RLS on every public table **that existed at that time**. Postgres
defaults newly created tables to RLS-disabled, so `project_comments` would be
silently world-readable/writable via the anon key the moment it's created —
reopening the exact hole that migration closed, scoped to this table. A new
migration must enable RLS on it (no policies needed, same as the lockdown: the
app writes through the service-role admin client, which bypasses RLS).

---

## Backend

### `src/lib/mentions.ts` (new — small justified refactor)

`extractMentionUserIds` and `toPlainText` currently live inside
`src/app/api/tickets/work-items/[id]/comments/route.ts`. The new project-comments
route needs the identical mention-parsing logic, so both routes should import
one implementation instead of duplicating a regex-based Tiptap-mention parser.
Move both functions here, unchanged; update the work-item route to import them;
update `src/__tests__/mention-extraction.test.ts`'s import path. No behavior
change.

### `src/lib/tickets.ts` (extend)

New section mirroring the existing `── Comments ──` block:

- `ProjectComment` interface — same shape as `WorkItemComment` but `project_id`
  instead of `work_item_id`.
- `getProjectComments(projectId)`, `createProjectComment(projectId, authorId, body)`,
  `updateProjectComment(commentId, body)`, `deleteProjectComment(commentId)`,
  `getProjectComment(commentId)` — same Supabase-admin-client pattern as the
  work-item versions, joined to `users(name)` for `author_name`.

### Routes (new, mirror the work-item comment routes)

`GET/POST /api/tickets/projects/[id]/comments/route.ts`
- `GET`: `requireSession()` + `canViewProject` → `getProjectComments`.
- `POST`: `requireSession()` + `canCommentOnProject` → sanitize rich text
  (`sanitizeRichText`/`isRichTextEmpty`, same as today), extract mentions via
  the shared helper, `createProjectComment`, then `notifyMention` for any
  mentioned project members (excluding the author), link:
  `/projects/${id}/discussion?comment=${created.id}`.
- Simpler than the work-item route: `id` in the path is already the project id,
  no work-item lookup hop needed first.

`PATCH/DELETE /api/tickets/projects/[id]/comments/[commentId]/route.ts`
- Same author-or-admin check as the work-item version.

### Permissions

No changes. `canViewProject`/`canCommentOnProject` (`src/lib/permissions.ts`)
are already project-scoped — they already govern task comments today via the
work item's `project_id` — so they apply to the new routes unchanged.

---

## UI

### `/projects/[id]/discussion` (new page)

Server component mirroring `/projects/[id]/settings/page.tsx`'s shape: header +
"Back to project" link, gated on `canViewProject` (redirect to `/projects` if
not — same guard the board page uses), rendering a new client component.

### `src/components/project-discussion.client.tsx` (new)

Same list-plus-editor pattern as the Comments tab in `task-detail-sheet.tsx`:
comment list (author, timestamp, delete for own/admin) + `RichTextEditor`
(`enableMentions`, `enableEmoji`, `mentionUsers` from project members) + post
button. Reads a `?comment=` query param on load to scroll-to and briefly
highlight a specific comment, mirroring the existing highlight logic in
`task-detail-sheet.tsx`.

### `/projects/[id]/page.tsx` (extend)

Add a "Discussion" link next to the existing "Settings" link in the board
header, visible to anyone with `canView` (not gated on `canManage` the way
Settings is).

Rejected alternatives: a tab on the board page (no tab scaffold exists there
today — the board page is 100% the Kanban board); a slide-over sheet like task
comments (sheets here are for transient item detail, not a persistent
page-level feature).

---

## Error handling

Matches the work-item comment routes exactly: empty body → 400, not
found/no-access → 404/403, Supabase failure on create/update/delete → 502 with
the raw error message. No new error paths.

## Testing

- `src/__tests__/mention-extraction.test.ts`: import path updates to
  `@/lib/mentions`; all existing cases keep passing unchanged (pure function,
  unmoved logic).
- `src/__tests__/route-hardening.test.ts`: add cases for the new
  project-comments routes — non-member rejected before hitting the service
  layer, empty body rejected, non-author/non-admin blocked from PATCH/DELETE —
  following the existing mock-session/mock-lib pattern in that file.
- `src/__tests__/supabase-write-columns.test.ts`: no manual change — it parses
  `schema.ts` automatically, so it covers the new `project_comments`
  insert/update payloads as soon as the table is modeled.
- No new unit tests for the thin CRUD wrappers in `lib/tickets.ts` — the
  existing work-item comment wrappers aren't unit-tested either; this matches
  convention rather than inventing new scope.
- `npm run verify` (lint + build) + `npm test` before calling this done.

## Migration

1. Add `projectComments` to `src/db/schema.ts`.
2. `npx drizzle-kit generate` → new file in `drizzle/`.
3. Hand-author a small `docs/migrations/enable-rls-project-comments.sql` that
   runs `ALTER TABLE public.project_comments ENABLE ROW LEVEL SECURITY;`.
4. Apply both to the live Supabase DB (direct connection per the established
   `scripts/apply-migration.ts` pattern — the pooler is dead for DDL) and
   verify with the same `rowsecurity` query the lockdown migration documents.

## File-by-file change list

| File | Change |
|------|--------|
| `src/db/schema.ts` | add `projectComments` table |
| `drizzle/000X_*.sql` | **new** — generated table DDL |
| `docs/migrations/enable-rls-project-comments.sql` | **new** — enable RLS on the new table |
| `src/lib/mentions.ts` | **new** — `extractMentionUserIds` + `toPlainText`, moved out of the work-item comments route |
| `src/app/api/tickets/work-items/[id]/comments/route.ts` | import mention helpers from `src/lib/mentions.ts` instead of defining locally |
| `src/lib/tickets.ts` | add `ProjectComment` type + get/create/update/delete/get functions |
| `src/app/api/tickets/projects/[id]/comments/route.ts` | **new** — GET/POST |
| `src/app/api/tickets/projects/[id]/comments/[commentId]/route.ts` | **new** — PATCH/DELETE |
| `src/app/(app)/projects/[id]/discussion/page.tsx` | **new** — page shell |
| `src/components/project-discussion.client.tsx` | **new** — list + editor UI |
| `src/app/(app)/projects/[id]/page.tsx` | add "Discussion" link next to "Settings" |
| `src/__tests__/mention-extraction.test.ts` | update import path |
| `src/__tests__/route-hardening.test.ts` | add coverage for new routes |
