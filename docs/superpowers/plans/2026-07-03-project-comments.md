# Project-Level Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project-scoped "Discussion" comment thread (separate from existing task/work-item comments) so members can discuss the whole project.

**Architecture:** A new `project_comments` table (mirrors the existing `work_item_comments` table exactly), new `GET/POST` and `PATCH/DELETE` API routes under `/api/tickets/projects/[projectId]/comments`, a new `/projects/[id]/discussion` page + client component reusing the existing rich-text/mentions editor, and reuse of the existing project-role permission functions and `notifyMention` notification helper. A small refactor pulls the shared mention-parsing helper out of the work-item comments route into `src/lib/mentions.ts` so both routes use one implementation.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM (schema modeling only — migration is hand-authored SQL per current project convention), Supabase Postgres, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-03-project-comments-design.md`

---

### Task 1: Extract mention-parsing helpers into `src/lib/mentions.ts`

**Files:**
- Create: `src/lib/mentions.ts`
- Modify: `src/app/api/tickets/work-items/[id]/comments/route.ts`
- Modify (test): `src/__tests__/mention-extraction.test.ts`

- [ ] **Step 1: Point the existing test at the not-yet-created module**

In `src/__tests__/mention-extraction.test.ts`, change the import:

```ts
import { extractMentionUserIds } from '@/lib/mentions';
```

(replaces `import { extractMentionUserIds } from '@/app/api/tickets/work-items/[id]/comments/route';`)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/__tests__/mention-extraction.test.ts`
Expected: FAIL — `Cannot find module '@/lib/mentions'` (or similar resolution error).

- [ ] **Step 3: Create `src/lib/mentions.ts`**

```ts
/**
 * Pull the mentioned user ids out of submitted comment HTML.
 *
 * The Tiptap Mention extension serializes each mention as
 * `<span data-type="mention" data-id="123" data-label="…">@Name</span>`.
 * We scan every span, keep the ones tagged `data-type="mention"`, and read their
 * `data-id`. Robust to attribute order and quote style. Run this on the RAW HTML
 * *before* sanitizing — `sanitizeRichText` strips the `data-*` attributes.
 *
 * Pure function (no I/O) so it can be unit-tested directly.
 */
export function extractMentionUserIds(html: string | null | undefined): number[] {
  if (!html) return [];
  const ids = new Set<number>();
  const spanRe = /<span\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = spanRe.exec(html)) !== null) {
    const attrs = m[1];
    if (!/data-type\s*=\s*["']mention["']/i.test(attrs)) continue;
    const idMatch = attrs.match(/data-id\s*=\s*["'](\d+)["']/i);
    if (!idMatch) continue;
    const id = Number(idMatch[1]);
    if (Number.isInteger(id) && id > 0) ids.add(id);
  }
  return [...ids];
}

// Strip tags to a readable plain-text snippet for the activity log + email.
export function toPlainText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
```

- [ ] **Step 4: Update the work-item comments route to import from the new module**

In `src/app/api/tickets/work-items/[id]/comments/route.ts`, replace the top of the file (imports through the end of the `toPlainText` function) with:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkItemDetail, getComments, createComment, logActivity, getProjectMembers, getProjectName } from '@/lib/tickets';
import { canCommentOnProject, canViewProject } from '@/lib/permissions';
import { notifyMention } from '@/lib/notifications';
import { sanitizeRichText, isRichTextEmpty } from '@/lib/sanitize';
import { extractMentionUserIds, toPlainText } from '@/lib/mentions';
import { route, requireSession, parseBody, badRequest, forbidden, notFound } from '@/lib/api';

export const runtime = 'nodejs';

const commentSchema = z.object({
  // Now rich-text HTML from the shared editor. `mentions` is accepted for
  // backward-compat with the old plain-text client but is no longer trusted —
  // recipients are derived from the @mention nodes in the HTML (see below).
  body:     z.string().nullable().optional(),
  mentions: z.array(z.number().int().positive()).optional(),
});
```

Everything below this (the `GET` and `POST` handlers) is unchanged — only the two function definitions (`extractMentionUserIds`, `toPlainText`) and their doc comment are removed from this file, replaced by the import line above.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/__tests__/mention-extraction.test.ts`
Expected: PASS (all 8 cases).

- [ ] **Step 6: Confirm nothing else imports the old location**

Run: `grep -rn "comments/route'" src/__tests__ src/app src/components | grep -i mention`
Expected: no output (no remaining imports of `extractMentionUserIds`/`toPlainText` from the route file).

- [ ] **Step 7: Commit**

```bash
git add src/lib/mentions.ts src/app/api/tickets/work-items/[id]/comments/route.ts src/__tests__/mention-extraction.test.ts
git commit -m "refactor: extract mention-parsing helpers into src/lib/mentions.ts"
```

---

### Task 2: Add the `project_comments` table

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/0009_project_comments.sql`
- Create: `docs/migrations/enable-rls-project-comments.sql`

> **Note:** this task's apply step (Step 4) runs DDL against the live shared Supabase
> database (the same one `npm run dev` connects to — there is no separate local DB
> for this project). That is expected and necessary: the table must exist there for
> the feature to work at all when tested locally.

- [ ] **Step 1: Add the table to `src/db/schema.ts`**

Insert immediately after the `workItemComments` table definition (it ends with `]);` right before `export const labels = pgTable(...)`):

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

- [ ] **Step 2: Hand-author the migration** (do NOT run `drizzle-kit generate` — `drizzle/meta/_journal.json` is stuck at `0007_wonderful_peter_quill` because the last two migrations, `0007_user_approved_hours_schedule.sql` and `0008_email_templates.sql`, were hand-authored and applied directly without registering in the journal; running `generate` now would try to re-diff from that stale point and re-emit already-live changes)

Create `drizzle/0009_project_comments.sql`:

```sql
-- New project-scoped discussion comments (separate from work_item_comments).
-- Mirrors work_item_comments exactly, scoped to a project instead of a task.
-- Additive + idempotent. Apply via scripts/apply-migration.ts (pooler can't run DDL).
CREATE TABLE IF NOT EXISTS project_comments (
  id         serial PRIMARY KEY NOT NULL,
  project_id integer NOT NULL REFERENCES projects(id) ON DELETE cascade,
  author_id  integer NOT NULL REFERENCES users(id) ON DELETE cascade,
  body       text NOT NULL,
  created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS project_comments_project_idx ON project_comments USING btree (project_id);
```

- [ ] **Step 3: Hand-author the RLS migration**

Create `docs/migrations/enable-rls-project-comments.sql`:

```sql
-- =====================================================================
-- enable-rls-project-comments.sql                        2026-07-03
-- Closes the same "RLS Disabled in Public" hole the 2026-07-01 lockdown
-- (enable-rls-all-public-tables.sql) closed for every table that existed
-- at that time. Postgres defaults newly created tables to RLS-disabled,
-- so the new project_comments table (drizzle/0009_project_comments.sql)
-- would otherwise be world-readable/writable via the anon key.
--
-- Safe for the same reason as the original lockdown: this app writes
-- through the service-role admin client / DATABASE_URL owner role, both
-- of which bypass RLS. No policies needed — anon/authenticated simply
-- lose PostgREST access to this table.
--
-- REVERSIBLE: ALTER TABLE public.project_comments DISABLE ROW LEVEL SECURITY;
-- =====================================================================

ALTER TABLE public.project_comments ENABLE ROW LEVEL SECURITY;

-- VERIFY (should return 1 row with rowsecurity = true):
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' AND tablename = 'project_comments';
```

- [ ] **Step 4: Apply both migrations to the live database**

Run: `npx tsx --env-file=.env scripts/apply-migration.ts drizzle/0009_project_comments.sql docs/migrations/enable-rls-project-comments.sql`
Expected: `applied` printed for both files, then `done` (or `already applied (<code>)` if re-run).

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts drizzle/0009_project_comments.sql docs/migrations/enable-rls-project-comments.sql
git commit -m "feat: add project_comments table"
```

---

### Task 3: Add `ProjectComment` CRUD functions to `src/lib/tickets.ts`

**Files:**
- Modify: `src/lib/tickets.ts`

- [ ] **Step 1: Add the new section**

Insert immediately after the existing `getComment` function (end of the `── Comments ──` section, right before `// ── Labels ──`):

```ts
// ── Project Comments ───────────────────────────────────────────────────

export interface ProjectComment {
  id: number;
  project_id: number;
  author_id: number;
  author_name: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export async function getProjectComments(projectId: string): Promise<ProjectComment[]> {
  const sb = createAdminClient();
  const { data, error } = await sb.from('project_comments')
    .select('id, project_id, author_id, body, created_at, updated_at, users(name)')
    .eq('project_id', Number(projectId))
    .order('created_at');
  if (error) throw new PlaneApiError(500, `project-comments/${projectId}`);
  return (data ?? []).map((r: Row) => ({
    id: Number(r.id),
    project_id: Number(r.project_id),
    author_id: Number(r.author_id),
    author_name: String((r.users as Row | null)?.name ?? 'Unknown'),
    body: String(r.body),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  }));
}

export async function createProjectComment(projectId: string, authorId: number, body: string): Promise<ProjectComment> {
  const sb = createAdminClient();
  const { data, error } = await sb.from('project_comments').insert({
    project_id: Number(projectId),
    author_id: authorId,
    body,
  }).select('id').single();
  if (error || !data) throw new PlaneApiError(502, `project-comments create`);
  const all = await getProjectComments(projectId);
  const found = all.find(c => c.id === Number(data.id));
  if (!found) throw new PlaneApiError(502, `project-comments readback`);
  return found;
}

export async function updateProjectComment(commentId: string, body: string): Promise<void> {
  const sb = createAdminClient();
  const { error } = await sb.from('project_comments')
    .update({ body, updated_at: new Date().toISOString() })
    .eq('id', Number(commentId));
  if (error) throw new PlaneApiError(502, `project-comments/${commentId}`);
}

export async function deleteProjectComment(commentId: string): Promise<void> {
  const sb = createAdminClient();
  const { error } = await sb.from('project_comments').delete().eq('id', Number(commentId));
  if (error) throw new PlaneApiError(502, `project-comments/${commentId}`);
}

export async function getProjectComment(commentId: string): Promise<{ id: number; author_id: number; project_id: number } | null> {
  const sb = createAdminClient();
  const { data } = await sb.from('project_comments')
    .select('id, author_id, project_id').eq('id', Number(commentId)).maybeSingle();
  if (!data) return null;
  return { id: Number(data.id), author_id: Number(data.author_id), project_id: Number(data.project_id) };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `src/lib/tickets.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tickets.ts
git commit -m "feat: add project comment CRUD functions"
```

---

### Task 4: TDD the project comments list route (`GET`/`POST`)

**Files:**
- Create: `src/app/api/tickets/projects/[projectId]/comments/route.ts`
- Modify (test): `src/__tests__/route-hardening.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/__tests__/route-hardening.test.ts`, insert the following three cases right before the final `});` that closes the `describe('route hardening coverage', ...)` block (i.e., immediately after the existing `'weekly report stays available to IC users...'` test's closing `});`):

```ts
  it('project comment creation is blocked for a user without comment access', async () => {
    const createProjectComment = vi.fn();
    mockSession(user());
    vi.doMock('@/lib/permissions', () => ({
      canCommentOnProject: vi.fn().mockResolvedValue(false),
    }));
    vi.doMock('@/lib/tickets', () => ({ createProjectComment }));

    const { POST } = await import('@/app/api/tickets/projects/[projectId]/comments/route');
    const res = await POST(
      jsonReq('POST', { body: '<p>hello</p>' }),
      { params: Promise.resolve({ projectId: '7' }) },
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(createProjectComment).not.toHaveBeenCalled();
  });

  it('project comment creation rejects an empty body before calling the ticket service', async () => {
    const createProjectComment = vi.fn();
    mockSession(user());
    vi.doMock('@/lib/permissions', () => ({
      canCommentOnProject: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock('@/lib/tickets', () => ({ createProjectComment }));

    const { POST } = await import('@/app/api/tickets/projects/[projectId]/comments/route');
    const res = await POST(
      jsonReq('POST', { body: '<p></p>' }),
      { params: Promise.resolve({ projectId: '7' }) },
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'body is required' });
    expect(createProjectComment).not.toHaveBeenCalled();
  });

  it('project comments listing is blocked for a user without project view access', async () => {
    const getProjectComments = vi.fn();
    mockSession(user());
    vi.doMock('@/lib/permissions', () => ({
      canViewProject: vi.fn().mockResolvedValue(false),
    }));
    vi.doMock('@/lib/tickets', () => ({ getProjectComments }));

    const { GET } = await import('@/app/api/tickets/projects/[projectId]/comments/route');
    const res = await GET(
      new Request('http://localhost/api/test'),
      { params: Promise.resolve({ projectId: '7' }) },
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(getProjectComments).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/__tests__/route-hardening.test.ts -t "project comment"`
Expected: FAIL — `Cannot find module '@/app/api/tickets/projects/[projectId]/comments/route'`.

- [ ] **Step 3: Create the route**

Create `src/app/api/tickets/projects/[projectId]/comments/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getProjectComments, createProjectComment, getProjectMembers, getProjectName } from '@/lib/tickets';
import { canCommentOnProject, canViewProject } from '@/lib/permissions';
import { notifyMention } from '@/lib/notifications';
import { sanitizeRichText, isRichTextEmpty } from '@/lib/sanitize';
import { extractMentionUserIds, toPlainText } from '@/lib/mentions';
import { route, requireSession, parseBody, badRequest, forbidden } from '@/lib/api';

export const runtime = 'nodejs';

const commentSchema = z.object({
  body: z.string().nullable().optional(),
});

export const GET = route(async (_req: Request, { params }: { params: Promise<{ projectId: string }> }) => {
  const session = await requireSession();
  const { projectId } = await params;
  if (!(await canViewProject(session, Number(projectId)))) {
    throw forbidden();
  }
  return NextResponse.json(await getProjectComments(projectId));
});

export const POST = route(async (req: Request, { params }: { params: Promise<{ projectId: string }> }) => {
  const session = await requireSession();
  const { projectId } = await params;
  if (!(await canCommentOnProject(session, Number(projectId)))) {
    throw forbidden();
  }

  const body = await parseBody(req, commentSchema);

  const rawHtml = body.body ?? '';
  if (isRichTextEmpty(rawHtml)) throw badRequest('body is required');

  // Resolve mentions from the HTML BEFORE sanitizing (sanitize drops data-id),
  // then store the sanitized HTML.
  const mentionIds = extractMentionUserIds(rawHtml);
  const cleanHtml = sanitizeRichText(rawHtml);
  const plain = toPlainText(cleanHtml);

  try {
    const created = await createProjectComment(projectId, session.id, cleanHtml);

    // Notify tagged teammates (must be project members; never notify self).
    if (mentionIds.length) {
      const members = await getProjectMembers(projectId);
      const memberIds = new Set(members.map(m => m.user_id));
      const recipients = mentionIds.filter(uid => uid !== session.id && memberIds.has(uid));
      if (recipients.length) {
        const projectName = await getProjectName(Number(projectId));
        await notifyMention({
          recipientIds: recipients,
          actorId:      session.id,
          actorName:    session.name,
          projectName,
          snippet:      plain.slice(0, 120),
          // Deep-link straight to the project discussion page and the exact
          // comment they were tagged in.
          link:         `/projects/${projectId}/discussion?comment=${created.id}`,
        });
      }
    }

    return NextResponse.json(created);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/__tests__/route-hardening.test.ts`
Expected: PASS (all cases, including the 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/tickets/projects/\[projectId\]/comments/route.ts src/__tests__/route-hardening.test.ts
git commit -m "feat: add GET/POST project comments route"
```

---

### Task 5: TDD the project comment detail route (`PATCH`/`DELETE`)

**Files:**
- Create: `src/app/api/tickets/projects/[projectId]/comments/[commentId]/route.ts`
- Modify (test): `src/__tests__/route-hardening.test.ts`

- [ ] **Step 1: Write the failing tests**

Append these two cases directly after the three added in Task 4 (still before the closing `});` of the `describe` block):

```ts
  it('project comment update is blocked for a non-author, non-admin user', async () => {
    const updateProjectComment = vi.fn();
    mockSession(user({ id: 11, role: 'ic' }));
    vi.doMock('@/lib/tickets', () => ({
      getProjectComment: vi.fn().mockResolvedValue({ id: 5, author_id: 99, project_id: 7 }),
      updateProjectComment,
    }));

    const { PATCH } = await import('@/app/api/tickets/projects/[projectId]/comments/[commentId]/route');
    const res = await PATCH(
      jsonReq('PATCH', { body: 'edited' }),
      { params: Promise.resolve({ projectId: '7', commentId: '5' }) },
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(updateProjectComment).not.toHaveBeenCalled();
  });

  it('project comment delete is blocked for a non-author, non-admin user', async () => {
    const deleteProjectComment = vi.fn();
    mockSession(user({ id: 11, role: 'ic' }));
    vi.doMock('@/lib/tickets', () => ({
      getProjectComment: vi.fn().mockResolvedValue({ id: 5, author_id: 99, project_id: 7 }),
      deleteProjectComment,
    }));

    const { DELETE } = await import('@/app/api/tickets/projects/[projectId]/comments/[commentId]/route');
    const res = await DELETE(
      jsonReq('DELETE', {}),
      { params: Promise.resolve({ projectId: '7', commentId: '5' }) },
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(deleteProjectComment).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/__tests__/route-hardening.test.ts -t "project comment"`
Expected: FAIL — `Cannot find module '@/app/api/tickets/projects/[projectId]/comments/[commentId]/route'`.

- [ ] **Step 3: Create the route**

Create `src/app/api/tickets/projects/[projectId]/comments/[commentId]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getProjectComment, updateProjectComment, deleteProjectComment } from '@/lib/tickets';
import { route, requireSession, parseBody, badRequest, forbidden, notFound } from '@/lib/api';

export const runtime = 'nodejs';

type CommentCtx = { params: Promise<{ projectId: string; commentId: string }> };

const commentSchema = z.object({
  body: z.string().nullable().optional(),
});

export const PATCH = route(async (req: Request, ctx: CommentCtx) => {
  const session = await requireSession();

  const { commentId } = await ctx.params;
  const existing = await getProjectComment(commentId);
  if (!existing) throw notFound();
  if (existing.author_id !== session.id && session.role !== 'admin') {
    throw forbidden();
  }

  const body = await parseBody(req, commentSchema);

  const trimmed = (body.body ?? '').trim();
  if (!trimmed) throw badRequest('body is required');

  try {
    await updateProjectComment(commentId, trimmed);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});

export const DELETE = route(async (_req: Request, ctx: CommentCtx) => {
  const session = await requireSession();

  const { commentId } = await ctx.params;
  const existing = await getProjectComment(commentId);
  if (!existing) throw notFound();
  if (existing.author_id !== session.id && session.role !== 'admin') {
    throw forbidden();
  }

  try {
    await deleteProjectComment(commentId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed' },
      { status: 502 },
    );
  }
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/__tests__/route-hardening.test.ts`
Expected: PASS (all cases, including the 5 project-comment ones added across Tasks 4–5).

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS. In particular `src/__tests__/supabase-write-columns.test.ts` should still pass — it parses `schema.ts` automatically, so it now validates the `project_comments` insert/update payloads written in Task 3 against the columns added in Task 2.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/tickets/projects/\[projectId\]/comments/\[commentId\]/route.ts src/__tests__/route-hardening.test.ts
git commit -m "feat: add PATCH/DELETE project comment route"
```

---

### Task 6: Build the `ProjectDiscussionClient` component

**Files:**
- Create: `src/components/project-discussion-client.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { RichTextEditor } from '@/components/rich-text-editor.client';
import { RichText } from '@/components/rich-text';
import { isRichTextEmpty } from '@/lib/sanitize';

interface ProjectComment {
  id: number;
  author_id: number;
  author_name: string;
  body: string;
  created_at: string;
}

interface Member {
  user_id: number;
  name: string;
}

function fmt(ts: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function ProjectDiscussionClient({
  projectId,
  initialComments,
  members,
  currentUserId,
  isAdmin,
  canComment,
  initialFocusCommentId,
}: {
  projectId: string;
  initialComments: ProjectComment[];
  members: Member[];
  currentUserId: number;
  isAdmin: boolean;
  canComment: boolean;
  initialFocusCommentId?: string | null;
}) {
  const [comments, setComments] = useState<ProjectComment[]>(initialComments);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [error, setError] = useState('');
  const [highlightCommentId, setHighlightCommentId] = useState<string | null>(null);
  const commentsListRef = useRef<HTMLDivElement>(null);
  const handledFocusRef = useRef(false);

  // Honor a ?comment= deep link (from a "tagged you" notification): scroll to
  // and briefly highlight the tagged comment. Guarded by a ref so it only
  // fires once even though `comments` can change after this runs (posting).
  useEffect(() => {
    if (!initialFocusCommentId || handledFocusRef.current) return;
    if (!comments.some(c => String(c.id) === initialFocusCommentId)) return;
    handledFocusRef.current = true;

    let innerRaf = 0;
    const raf = window.requestAnimationFrame(() => {
      innerRaf = window.requestAnimationFrame(() => {
        commentsListRef.current
          ?.querySelector(`[data-comment-id="${initialFocusCommentId}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightCommentId(initialFocusCommentId);
      });
    });
    const clear = window.setTimeout(() => setHighlightCommentId(null), 2600);
    return () => {
      window.cancelAnimationFrame(raf);
      window.cancelAnimationFrame(innerRaf);
      window.clearTimeout(clear);
    };
  }, [initialFocusCommentId, comments]);

  const handlePostComment = async () => {
    if (isRichTextEmpty(newComment)) return;
    setPostingComment(true); setError('');
    try {
      const res = await fetch(`/api/tickets/projects/${projectId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: newComment }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? 'Failed to post');
      }
      const created = (await res.json()) as ProjectComment;
      setComments(prev => [...prev, created]);
      setNewComment('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setPostingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    const res = await fetch(`/api/tickets/projects/${projectId}/comments/${commentId}`, {
      method: 'DELETE',
    });
    if (res.ok) setComments(prev => prev.filter(c => c.id !== commentId));
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div ref={commentsListRef} className="space-y-3">
        {comments.length === 0 && (
          <p className="text-sm text-(--rs-neutral-grey-400) italic">No discussion yet.</p>
        )}
        {comments.map(c => (
          <div
            key={c.id}
            data-comment-id={c.id}
            className={`rounded-lg p-3 transition-colors duration-500 ${
              highlightCommentId === String(c.id)
                ? 'border border-(--rs-accent-300) bg-(--rs-accent-50) ring-2 ring-(--rs-accent-200)'
                : 'border border-(--rs-neutral-grey-100) bg-white'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-(--rs-neutral-grey-500) mb-1.5">
              <span className="font-medium text-(--rs-neutral-grey-800)">{c.author_name}</span>
              <div className="flex items-center gap-2">
                <span>{fmt(c.created_at)}</span>
                {(c.author_id === currentUserId || isAdmin) && (
                  <button
                    onClick={() => handleDeleteComment(c.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-(--rs-neutral-grey-400) hover:bg-red-50 hover:text-red-500"
                    title="Delete"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            <RichText html={c.body} className="text-sm text-(--rs-neutral-grey-800)" />
          </div>
        ))}
      </div>

      {canComment && (
        <div className="pt-2 space-y-2">
          <RichTextEditor
            value={newComment}
            onChange={setNewComment}
            placeholder="Write an update… use @ to tag a teammate"
            bodyClassName="min-h-[84px] overflow-y-auto"
            enableMentions
            enableEmoji
            mentionUsers={members.map(m => ({ id: m.user_id, name: m.name }))}
          />
          <button
            onClick={handlePostComment}
            disabled={postingComment || isRichTextEmpty(newComment)}
            className="flex min-h-10 items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--rs-primary-500)' }}
          >
            {postingComment && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Post
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npx eslint src/components/project-discussion-client.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/project-discussion-client.tsx
git commit -m "feat: add ProjectDiscussionClient component"
```

---

### Task 7: Build the `/projects/[id]/discussion` page

**Files:**
- Create: `src/app/(app)/projects/[id]/discussion/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { getProjects, getProjectMembers, getProjectComments } from '@/lib/tickets';
import { getSession } from '@/lib/session';
import { getProjectCaps } from '@/lib/permissions';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ProjectDiscussionClient } from '@/components/project-discussion-client';

export default async function ProjectDiscussionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ comment?: string }>;
}) {
  const { id } = await params;
  const { comment } = await searchParams;
  const session = await getSession();
  if (!session) redirect('/login');

  // Per-project access: members/leads (+ admins) only; non-members are bounced.
  const caps = await getProjectCaps(session, Number(id));
  if (!caps.canView) redirect('/projects');

  const projects = await getProjects();
  const project = projects.find(p => p.id === id);
  if (!project) notFound();

  const [members, comments] = await Promise.all([
    getProjectMembers(id),
    getProjectComments(id),
  ]);

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">
            {project.name} — Discussion
          </h1>
          <p className="text-(--rs-neutral-grey-500) text-sm mt-1">
            General updates and discussion for the whole project.
          </p>
        </div>
        <Link
          href={`/projects/${id}`}
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md border border-(--rs-neutral-grey-200) bg-white px-3 py-2 text-sm font-medium text-(--rs-neutral-grey-700) transition-colors hover:bg-(--rs-neutral-grey-50) hover:text-(--rs-neutral-grey-900) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-300) sm:self-auto"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to project
        </Link>
      </div>

      <ProjectDiscussionClient
        projectId={id}
        initialComments={comments}
        members={members}
        currentUserId={session.id}
        isAdmin={session.role === 'admin'}
        canComment={caps.canComment}
        initialFocusCommentId={comment ?? null}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/app/\(app\)/projects/\[id\]/discussion/page.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/projects/\[id\]/discussion/page.tsx
git commit -m "feat: add project discussion page"
```

---

### Task 8: Link "Discussion" from the project board page

**Files:**
- Modify: `src/app/(app)/projects/[id]/page.tsx`

- [ ] **Step 1: Add the icon import**

Change:

```tsx
import { AlertCircle, Settings } from 'lucide-react';
```

to:

```tsx
import { AlertCircle, MessageSquare, Settings } from 'lucide-react';
```

- [ ] **Step 2: Add the Discussion link next to Settings**

Replace:

```tsx
        {caps.canManage && (
          <Link
            href={`/projects/${id}/settings`}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-(--rs-neutral-grey-200) bg-white px-3 py-2 text-sm text-(--rs-neutral-grey-600) transition-colors hover:border-(--rs-primary-300) hover:text-(--rs-primary-700)"
          >
            <Settings className="w-3.5 h-3.5" /> Settings
          </Link>
        )}
```

with:

```tsx
        <div className="flex items-center gap-2">
          <Link
            href={`/projects/${id}/discussion`}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-(--rs-neutral-grey-200) bg-white px-3 py-2 text-sm text-(--rs-neutral-grey-600) transition-colors hover:border-(--rs-primary-300) hover:text-(--rs-primary-700)"
          >
            <MessageSquare className="w-3.5 h-3.5" /> Discussion
          </Link>
          {caps.canManage && (
            <Link
              href={`/projects/${id}/settings`}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-(--rs-neutral-grey-200) bg-white px-3 py-2 text-sm text-(--rs-neutral-grey-600) transition-colors hover:border-(--rs-primary-300) hover:text-(--rs-primary-700)"
            >
              <Settings className="w-3.5 h-3.5" /> Settings
            </Link>
          )}
        </div>
```

(The Discussion link is unconditional because the page already redirects anyone without `caps.canView` before this JSX renders — so by this point every viewer is allowed on the discussion page too.)

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/app/\(app\)/projects/\[id\]/page.tsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(app\)/projects/\[id\]/page.tsx
git commit -m "feat: link project discussion from the board page"
```

---

### Task 9: Full verification + local manual check

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated check**

Run: `npm run verify && npm test`
Expected: lint clean, build succeeds, all tests pass.

- [ ] **Step 2: Start the dev server**

Run: `npm run dev`
Expected: server starts on `http://localhost:3000`.

- [ ] **Step 3: Manual walkthrough**

1. Log in, open any project you're a member of.
2. Click the new **Discussion** button next to Settings → lands on `/projects/[id]/discussion`.
3. Post a comment with an `@mention` of another project member → comment appears immediately; check the mentioned user's notification bell (or the `notifications` table) for a `mentioned` row whose `link` is `/projects/[id]/discussion?comment=<id>`.
4. Open that link directly (or as the mentioned user) → page scrolls to and briefly highlights the comment.
5. Delete your own comment → it disappears. Confirm a non-author, non-admin cannot delete someone else's comment (button is hidden for them).
6. As a project viewer (not lead/member), confirm you can still see and post to Discussion (matches task-comment permissions).
7. As a logged-in user who is NOT a project member, confirm visiting `/projects/[id]/discussion` redirects to `/projects`.

- [ ] **Step 4: Report back**

Summarize pass/fail for each item above so the user can take over from a running `npm run dev`.

---

## Self-Review Notes

- **Spec coverage:** every spec section (data model + RLS, shared mentions helper, lib functions, both routes, permissions reuse, UI placement, notifications, edit-capability non-goal, deep-link, testing) maps to a task above. ✓
- **Placeholders:** none — every step has complete, runnable code. ✓
- **Type/name consistency checked across tasks:** `ProjectComment` (Task 3) matches the shape returned by the route handlers (Task 4/5) and consumed by `ProjectDiscussionClient` (Task 6, using its own local `ProjectComment` interface with the same field names the API returns: `id, author_id, author_name, body, created_at`). `getProjectComment`/`updateProjectComment`/`deleteProjectComment`/`getProjectComments`/`createProjectComment` names match exactly between Task 3's definitions, Task 4/5's route imports, and Task 4/5's test mocks. `projectId`/`commentId` param names match between route file paths, `params` types, and test `Promise.resolve({...})` shapes. ✓
