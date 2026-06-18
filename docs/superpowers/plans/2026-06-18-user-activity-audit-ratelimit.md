# Per-person Activity + Audit Log + Rate Limiting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins drill into one person's full activity in User Management, record a real audit trail of admin actions, and add a Supabase-backed rate limiter on the highest-risk API routes.

**Architecture:** Two new tables (`audit_log`, `rate_limits`) via Drizzle. Pure helpers in `src/lib/{rate-limit,audit,activity}.ts` (unit-tested); thin wiring into existing routes. The activity API gains an optional `?userId=` filter and an `audit_log` source. The activity panel becomes a two-pane roster + timeline.

**Tech Stack:** Next.js 16 (App Router), Drizzle ORM + postgres-js (Supabase Postgres), Supabase admin client (PostgREST), vitest, Tailwind v4 with `--rs-` tokens, lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-18-user-activity-audit-ratelimit-design.md`

**Conventions to follow:**
- Commit messages are **single-line**, no `Co-Authored-By` trailer.
- Timestamps are stored as **text ISO** strings (match existing tables).
- Run checks with `npm test` (vitest), `npm run lint`, `npm run build` (or `npm run verify` = lint+build).

---

## File Structure

- **Create**
  - `src/lib/rate-limit.ts` — window math, key builders, client IP, `checkRateLimit`/`enforceRateLimit`.
  - `src/lib/audit.ts` — `recordAudit`, `deriveUserPatchAction`, `describeAudit`.
  - `src/lib/activity.ts` — `parseActivityUserId` (pure param validation).
  - `docs/migrations/add-audit-log-and-rate-limits.sql` — hand-written DDL (repo convention).
  - `src/__tests__/rate-limit.test.ts`, `src/__tests__/audit.test.ts`, `src/__tests__/activity.test.ts`.
- **Modify**
  - `src/db/schema.ts` — add `auditLog`, `rateLimits`.
  - `src/lib/api/errors.ts` — `HttpError.headers` + `tooManyRequests`.
  - `src/lib/api/route.ts` — apply `HttpError.headers` to the response.
  - `src/app/api/admin/users/route.ts` — audit writes + rate limit.
  - `src/app/api/admin/overtime-requests/route.ts` — rate limit.
  - `src/app/api/admin/activity/route.ts` — `userId` filter + audit source.
  - `src/app/api/public/applications/[positionId]/route.ts` — per-IP rate limit.
  - `src/app/api/public/talents/confirm/[token]/route.ts` + `revoke/[token]/route.ts` — per-IP rate limit.
  - `src/app/api/cron/auto-clock-out/route.ts` — prune stale `rate_limits`.
  - `src/components/users-admin-tabs.tsx` — pass `initialUsers` to the panel.
  - `src/components/user-activity-panel.tsx` — two-pane roster + timeline.

---

## Task 1: Schema + migration for `audit_log` and `rate_limits`

**Files:**
- Modify: `src/db/schema.ts:2` (import line) and append two tables
- Create: `docs/migrations/add-audit-log-and-rate-limits.sql`

- [ ] **Step 1: Add `primaryKey` to the pg-core import**

In `src/db/schema.ts` line 2, change:
```ts
import { pgTable, text, integer, serial, jsonb, numeric, unique, boolean, index } from 'drizzle-orm/pg-core';
```
to:
```ts
import { pgTable, text, integer, serial, jsonb, numeric, unique, boolean, index, primaryKey } from 'drizzle-orm/pg-core';
```

- [ ] **Step 2: Append the two tables at the end of `src/db/schema.ts`**

```ts
// Admin-action audit trail. Records who did what to whom (user create / role
// change / (de)activate). Best-effort writes (see src/lib/audit.ts); also a
// source in the admin activity feed. Mirror of
// docs/migrations/add-audit-log-and-rate-limits.sql.
export const auditLog = pgTable('audit_log', {
  id:           serial('id').primaryKey(),
  actorId:      integer('actor_id').notNull(),
  action:       text('action').notNull(),
  targetUserId: integer('target_user_id'),
  details:      jsonb('details'),
  createdAt:    text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index('audit_log_created_idx').on(t.createdAt),
  index('audit_log_actor_idx').on(t.actorId),
]);

// Fixed-window API rate limiter. One row per (key, window_start); count is
// incremented atomically. See src/lib/rate-limit.ts.
export const rateLimits = pgTable('rate_limits', {
  key:         text('key').notNull(),
  windowStart: text('window_start').notNull(),
  count:       integer('count').notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.key, t.windowStart] }),
]);
```

- [ ] **Step 3: Write the hand-written migration**

Create `docs/migrations/add-audit-log-and-rate-limits.sql`:
```sql
-- Admin-action audit trail + API rate-limit counters (Phase 1).
create table if not exists audit_log (
  id             serial primary key,
  actor_id       integer not null,
  action         text not null,
  target_user_id integer,
  details        jsonb,
  created_at     text not null default CURRENT_TIMESTAMP
);
create index if not exists audit_log_created_idx on audit_log (created_at);
create index if not exists audit_log_actor_idx   on audit_log (actor_id);

create table if not exists rate_limits (
  key          text not null,
  window_start text not null,
  count        integer not null default 0,
  primary key (key, window_start)
);
```

- [ ] **Step 4: Generate the Drizzle migration**

Run: `npx drizzle-kit generate`
Expected: a new file under `drizzle/` creating `audit_log` and `rate_limits`. (If `DATABASE_URL` is required and absent, the SQL hand-migration in Step 3 is the source of truth — note that in the commit.)

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: build succeeds (schema compiles).

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts docs/migrations/add-audit-log-and-rate-limits.sql drizzle/
git commit -m "feat: add audit_log and rate_limits tables"
```

> **DB apply note:** Applying to prod may need the direct DB connection (pooler creds have been stale). Verify with a service-role head-probe before relying on the columns.

---

## Task 2: `HttpError` headers + `tooManyRequests` (429)

**Files:**
- Modify: `src/lib/api/errors.ts`
- Modify: `src/lib/api/route.ts:14-16`
- Test: `src/__tests__/rate-limit.test.ts` (the 429 shape is covered alongside Task 3)

- [ ] **Step 1: Extend `HttpError` and add `tooManyRequests` in `src/lib/api/errors.ts`**

Replace the `HttpError` class and add the helper:
```ts
export class HttpError extends Error {
  status: number;
  headers?: Record<string, string>;
  constructor(status: number, message: string, headers?: Record<string, string>) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.headers = headers;
  }
}

export const badRequest   = (message = 'Bad request')  => new HttpError(400, message);
export const unauthorized = (message = 'Unauthorized') => new HttpError(401, message);
export const forbidden    = (message = 'Forbidden')    => new HttpError(403, message);
export const notFound     = (message = 'Not found')    => new HttpError(404, message);
export const tooManyRequests = (retryAfterSec = 60) =>
  new HttpError(429, 'Too many requests. Please slow down.', { 'Retry-After': String(retryAfterSec) });
```

- [ ] **Step 2: Apply headers in the route wrapper `src/lib/api/route.ts`**

Change the `HttpError` branch:
```ts
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
```
to:
```ts
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message }, { status: err.status, headers: err.headers });
      }
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api/errors.ts src/lib/api/route.ts
git commit -m "feat: add 429 tooManyRequests error with Retry-After header"
```

---

## Task 3: Rate-limit library

**Files:**
- Create: `src/lib/rate-limit.ts`
- Test: `src/__tests__/rate-limit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/rate-limit.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { windowStartIso, retryAfterSeconds, keyByUser, keyByIp, clientIp } from '@/lib/rate-limit';

const at = (iso: string) => new Date(iso);

describe('windowStartIso', () => {
  it('floors to the start of the fixed window', () => {
    // 60s window: 12:00:37 → 12:00:00
    expect(windowStartIso(at('2026-06-18T12:00:37.500Z'), 60)).toBe('2026-06-18T12:00:00.000Z');
  });
  it('handles a 1h window', () => {
    expect(windowStartIso(at('2026-06-18T12:59:59Z'), 3600)).toBe('2026-06-18T12:00:00.000Z');
  });
});

describe('retryAfterSeconds', () => {
  it('returns seconds left in the current window', () => {
    expect(retryAfterSeconds(at('2026-06-18T12:00:37Z'), 60)).toBe(23);
  });
  it('never returns less than 1', () => {
    expect(retryAfterSeconds(at('2026-06-18T12:00:00.000Z'), 60)).toBe(60);
    expect(retryAfterSeconds(at('2026-06-18T12:00:59.999Z'), 60)).toBe(1);
  });
});

describe('key builders', () => {
  it('namespaces by tag + id', () => {
    expect(keyByUser('admin-users', 7)).toBe('admin-users:u:7');
    expect(keyByIp('apply', '1.2.3.4')).toBe('apply:ip:1.2.3.4');
  });
});

describe('clientIp', () => {
  it('takes the first x-forwarded-for hop', () => {
    const req = new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } });
    expect(clientIp(req)).toBe('1.2.3.4');
  });
  it('falls back to x-real-ip then "unknown"', () => {
    expect(clientIp(new Request('http://x', { headers: { 'x-real-ip': '9.9.9.9' } }))).toBe('9.9.9.9');
    expect(clientIp(new Request('http://x'))).toBe('unknown');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/__tests__/rate-limit.test.ts`
Expected: FAIL — cannot resolve `@/lib/rate-limit`.

- [ ] **Step 3: Implement `src/lib/rate-limit.ts`**

```ts
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { rateLimits } from '@/db/schema';
import { tooManyRequests } from '@/lib/api';

// Fixed-window API rate limiter backed by the `rate_limits` table. Atomic at the
// DB (INSERT ... ON CONFLICT ... count + 1 RETURNING) so it is correct across
// serverless instances. Fails OPEN: a limiter outage must not take down a route.

/** Start of the fixed window containing `now`, as an ISO string. Pure. */
export function windowStartIso(now: Date, windowSeconds: number): string {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms).toISOString();
}

/** Seconds remaining in the current window (min 1). Pure. */
export function retryAfterSeconds(now: Date, windowSeconds: number): number {
  const elapsedSec = Math.floor((now.getTime() % (windowSeconds * 1000)) / 1000);
  return Math.max(1, windowSeconds - elapsedSec);
}

export function keyByUser(tag: string, userId: number | string): string {
  return `${tag}:u:${userId}`;
}

export function keyByIp(tag: string, ip: string): string {
  return `${tag}:ip:${ip}`;
}

/** Best client IP from proxy headers. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

export type RateLimitOpts = {
  key: string;
  limit: number;
  windowSeconds: number;
  now?: Date;
};

/** Non-throwing core. Returns ok=false when the window count exceeds limit. */
export async function checkRateLimit(
  { key, limit, windowSeconds, now = new Date() }: RateLimitOpts,
): Promise<{ ok: boolean; retryAfterSec: number; count: number }> {
  const windowStart = windowStartIso(now, windowSeconds);
  try {
    const rows = await db
      .insert(rateLimits)
      .values({ key, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimits.key, rateLimits.windowStart],
        set: { count: sql`${rateLimits.count} + 1` },
      })
      .returning({ count: rateLimits.count });
    const count = rows[0]?.count ?? 1;
    return { ok: count <= limit, retryAfterSec: retryAfterSeconds(now, windowSeconds), count };
  } catch (err) {
    console.error('[rate-limit] check failed, failing open:', err);
    return { ok: true, retryAfterSec: 0, count: 0 };
  }
}

/** Throwing variant for routes that use the `route()` wrapper. */
export async function enforceRateLimit(opts: RateLimitOpts): Promise<void> {
  const { ok, retryAfterSec } = await checkRateLimit(opts);
  if (!ok) throw tooManyRequests(retryAfterSec);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/__tests__/rate-limit.test.ts`
Expected: PASS (all pure-helper tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rate-limit.ts src/__tests__/rate-limit.test.ts
git commit -m "feat: add Supabase-backed fixed-window rate limiter"
```

---

## Task 4: Audit library

**Files:**
- Create: `src/lib/audit.ts`
- Test: `src/__tests__/audit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/audit.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { deriveUserPatchAction, describeAudit } from '@/lib/audit';

describe('deriveUserPatchAction', () => {
  it('detects deactivation', () => {
    expect(deriveUserPatchAction({ role: 'ic', is_active: 1 }, { role: 'ic', is_active: 0 }))
      .toEqual({ action: 'user.deactivated', details: {} });
  });
  it('detects reactivation', () => {
    expect(deriveUserPatchAction({ role: 'ic', is_active: 0 }, { role: 'ic', is_active: 1 }))
      .toEqual({ action: 'user.reactivated', details: {} });
  });
  it('detects role change with from/to', () => {
    expect(deriveUserPatchAction({ role: 'ic', is_active: 1 }, { role: 'lead', is_active: 1 }))
      .toEqual({ action: 'user.role_changed', details: { from: 'ic', to: 'lead' } });
  });
  it('falls back to a generic update', () => {
    expect(deriveUserPatchAction({ role: 'ic', is_active: 1 }, { role: 'ic', is_active: 1 }))
      .toEqual({ action: 'user.updated', details: {} });
  });
  it('prioritizes (de)activation over a simultaneous role change', () => {
    expect(deriveUserPatchAction({ role: 'ic', is_active: 1 }, { role: 'lead', is_active: 0 }).action)
      .toBe('user.deactivated');
  });
});

describe('describeAudit', () => {
  it('describes a role change with the transition', () => {
    expect(describeAudit('user.role_changed', { from: 'ic', to: 'lead' }))
      .toBe("Changed a user's role (ic → lead)");
  });
  it('describes account creation', () => {
    expect(describeAudit('user.created', null)).toBe('Created a user account');
  });
  it('handles unknown actions', () => {
    expect(describeAudit('user.frobnicated', null)).toBe('Admin action: user.frobnicated');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/__tests__/audit.test.ts`
Expected: FAIL — cannot resolve `@/lib/audit`.

- [ ] **Step 3: Implement `src/lib/audit.ts`**

```ts
import { createAdminClient } from '@/lib/supabase/admin';

export type AuditAction =
  | 'user.created'
  | 'user.role_changed'
  | 'user.deactivated'
  | 'user.reactivated'
  | 'user.updated';

// Best-effort audit write: logs failures but NEVER throws — an audit insert must
// not break the admin action it records.
export async function recordAudit(entry: {
  actorId: number;
  action: AuditAction;
  targetUserId?: number | null;
  details?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('audit_log').insert({
      actor_id:       entry.actorId,
      action:         entry.action,
      target_user_id: entry.targetUserId ?? null,
      details:        entry.details ?? null,
      created_at:     new Date().toISOString(),
    });
    if (error) console.error('[audit] insert failed:', error.message);
  } catch (err) {
    console.error('[audit] insert threw:', err);
  }
}

// Pure: derive the audit action for a user PATCH from before/after snapshots.
// (De)activation wins over a simultaneous role change.
export function deriveUserPatchAction(
  before: { role: string; is_active: number },
  after: { role: string; is_active: number },
): { action: AuditAction; details: Record<string, unknown> } {
  if (before.is_active === 1 && after.is_active === 0) return { action: 'user.deactivated', details: {} };
  if (before.is_active === 0 && after.is_active === 1) return { action: 'user.reactivated', details: {} };
  if (before.role !== after.role) return { action: 'user.role_changed', details: { from: before.role, to: after.role } };
  return { action: 'user.updated', details: {} };
}

// Pure: human-readable description for the activity feed.
export function describeAudit(action: string, details: Record<string, unknown> | null): string {
  const from = details?.from;
  const to = details?.to;
  switch (action) {
    case 'user.created':      return 'Created a user account';
    case 'user.role_changed': return from && to
      ? `Changed a user's role (${String(from)} → ${String(to)})`
      : "Changed a user's role";
    case 'user.deactivated':  return 'Deactivated a user';
    case 'user.reactivated':  return 'Reactivated a user';
    case 'user.updated':      return 'Updated a user account';
    default:                  return `Admin action: ${action}`;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/__tests__/audit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/audit.ts src/__tests__/audit.test.ts
git commit -m "feat: add admin audit log helpers"
```

---

## Task 5: Write audit entries from the users route

**Files:**
- Modify: `src/app/api/admin/users/route.ts`

- [ ] **Step 1: Import the audit helpers**

At the top of `src/app/api/admin/users/route.ts`, after the existing imports add:
```ts
import { recordAudit, deriveUserPatchAction } from '@/lib/audit';
```

- [ ] **Step 2: Capture the actor in POST**

Change `export const POST = route(async (req: Request) => {` body's first line:
```ts
  await requireAdmin();
```
to:
```ts
  const session = await requireAdmin();
```

- [ ] **Step 3: Record `user.created` after a successful insert**

In POST, immediately before `return NextResponse.json({ user: {`... (the 201 success response), add:
```ts
    await recordAudit({
      actorId: session.id,
      action: 'user.created',
      targetUserId: inserted.id as number,
      details: { role, team },
    });
```

- [ ] **Step 4: Capture before-state in PATCH and record the derived action**

In PATCH, after the guard `if (Object.keys(updates).length === 0) {...}` and before `updates.updated_at = ...`, fetch the prior snapshot:
```ts
  const admin = createAdminClient();
  const { data: before } = await admin
    .from('users')
    .select('role, is_active')
    .eq('id', body.id)
    .maybeSingle();
```
> NOTE: the existing PATCH declares `const admin = createAdminClient();` later (around line 226). Move that single declaration up to here and delete the later duplicate so `admin` is defined once.

Then, after the existing `const { data: updated } = await admin...maybeSingle();` block and its `if (!updated) ...` check, before the final `return NextResponse.json({ user: {`, add:
```ts
    if (before) {
      const { action, details } = deriveUserPatchAction(
        { role: String(before.role), is_active: Number(before.is_active) },
        { role: String(updated.role), is_active: Number(updated.is_active) },
      );
      await recordAudit({ actorId: session.id, action, targetUserId: body.id, details });
    }
```

- [ ] **Step 5: Verify build + existing route tests**

Run: `npm run build && npx vitest run`
Expected: build succeeds; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/users/route.ts
git commit -m "feat: record audit entries for admin user create/update"
```

---

## Task 6: Per-person filter + audit source in the activity API

**Files:**
- Create: `src/lib/activity.ts`
- Test: `src/__tests__/activity.test.ts`
- Modify: `src/app/api/admin/activity/route.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/activity.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseActivityUserId } from '@/lib/activity';

describe('parseActivityUserId', () => {
  it('treats missing/empty as the global feed (null)', () => {
    expect(parseActivityUserId(null)).toEqual({ ok: true, userId: null });
    expect(parseActivityUserId('')).toEqual({ ok: true, userId: null });
  });
  it('accepts a positive integer', () => {
    expect(parseActivityUserId('42')).toEqual({ ok: true, userId: 42 });
  });
  it('rejects zero, negatives, and non-integers', () => {
    expect(parseActivityUserId('0')).toEqual({ ok: false });
    expect(parseActivityUserId('-3')).toEqual({ ok: false });
    expect(parseActivityUserId('1.5')).toEqual({ ok: false });
    expect(parseActivityUserId('abc')).toEqual({ ok: false });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/__tests__/activity.test.ts`
Expected: FAIL — cannot resolve `@/lib/activity`.

- [ ] **Step 3: Implement `src/lib/activity.ts`**

```ts
// Pure validation for the admin activity feed's optional ?userId= filter.
export function parseActivityUserId(
  raw: string | null,
): { ok: true; userId: number | null } | { ok: false } {
  if (raw == null || raw === '') return { ok: true, userId: null };
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return { ok: false };
  return { ok: true, userId: n };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/__tests__/activity.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the activity route**

In `src/app/api/admin/activity/route.ts`:

(a) Imports — add:
```ts
import { badRequest } from '@/lib/api';
import { parseActivityUserId } from '@/lib/activity';
import { describeAudit } from '@/lib/audit';
```

(b) Extend the `ActivityType` union:
```ts
type ActivityType = 'ticket' | 'report' | 'clock' | 'attendance' | 'ping' | 'admin';
```

(c) Change the handler signature and add param parsing + per-user limits. Replace:
```ts
export const GET = route(async () => {
  await requireAdmin();
  const sb = createAdminClient();
```
with:
```ts
export const GET = route(async (req: Request) => {
  await requireAdmin();

  const parsed = parseActivityUserId(new URL(req.url).searchParams.get('userId'));
  if (!parsed.ok) throw badRequest('Invalid userId');
  const userId = parsed.userId; // null = global feed
  const perSource = userId == null ? PER_SOURCE : 200;
  const total = userId == null ? TOTAL : 300;

  const sb = createAdminClient();
```

(d) Filter each of the 5 existing source queries by `userId` when set. For each query, capture it in a `let`, conditionally `.eq(...)`, then await. Replace the five blocks as follows:

```ts
  // 1. Work item activity
  let wiaQ = sb.from('work_item_activity')
    .select('id, actor_id, action, created_at')
    .order('created_at', { ascending: false }).limit(perSource);
  if (userId != null) wiaQ = wiaQ.eq('actor_id', userId);
  const { data: wia } = await wiaQ;
  for (const a of (wia ?? []) as { id: number; actor_id: number; action: string; created_at: string | null }[]) {
    add(a.actor_id, `wia-${a.id}`, 'ticket', describeTicket(a.action), a.created_at);
  }

  // 2. Weekly reports submitted
  let wrQ = sb.from('weekly_reports')
    .select('id, user_id, submitted_at').not('submitted_at', 'is', null)
    .order('submitted_at', { ascending: false }).limit(perSource);
  if (userId != null) wrQ = wrQ.eq('user_id', userId);
  const { data: wr } = await wrQ;
  for (const r of (wr ?? []) as { id: number; user_id: number; submitted_at: string | null }[]) {
    add(r.user_id, `wr-${r.id}`, 'report', 'Submitted a weekly report', r.submitted_at);
  }

  // 3. Clock in / clock out
  let tsQ = sb.from('timesheets')
    .select('id, user_id, clocked_in_at, clocked_out_at')
    .order('clocked_in_at', { ascending: false }).limit(perSource);
  if (userId != null) tsQ = tsQ.eq('user_id', userId);
  const { data: ts } = await tsQ;
  for (const t of (ts ?? []) as { id: number; user_id: number; clocked_in_at: string | null; clocked_out_at: string | null }[]) {
    add(t.user_id, `ts-in-${t.id}`, 'clock', 'Clocked in', t.clocked_in_at);
    if (t.clocked_out_at) add(t.user_id, `ts-out-${t.id}`, 'clock', 'Clocked out', t.clocked_out_at);
  }

  // 4. Admin attendance edits
  let attQ = sb.from('attendance')
    .select('id, edited_by, edited_at, week_start').not('edited_at', 'is', null)
    .order('edited_at', { ascending: false }).limit(perSource);
  if (userId != null) attQ = attQ.eq('edited_by', userId);
  const { data: att } = await attQ;
  for (const a of (att ?? []) as { id: number; edited_by: number | null; edited_at: string | null; week_start: string }[]) {
    add(a.edited_by, `att-${a.id}`, 'attendance', `Edited attendance (week of ${a.week_start})`, a.edited_at);
  }

  // 5. Live presence pings sent
  let ppQ = sb.from('presence_pings')
    .select('id, from_user_id, created_at')
    .order('created_at', { ascending: false }).limit(perSource);
  if (userId != null) ppQ = ppQ.eq('from_user_id', userId);
  const { data: pp } = await ppQ;
  for (const p of (pp ?? []) as { id: string; from_user_id: number; created_at: string | null }[]) {
    add(p.from_user_id, `pp-${p.id}`, 'ping', 'Sent a live ping', p.created_at);
  }

  // 6. Admin actions (audit log)
  let auQ = sb.from('audit_log')
    .select('id, actor_id, action, details, created_at')
    .order('created_at', { ascending: false }).limit(perSource);
  if (userId != null) auQ = auQ.eq('actor_id', userId);
  const { data: au } = await auQ;
  for (const a of (au ?? []) as { id: number; actor_id: number; action: string; details: Record<string, unknown> | null; created_at: string | null }[]) {
    add(a.actor_id, `audit-${a.id}`, 'admin', describeAudit(a.action, a.details), a.created_at);
  }
```

(e) Use the per-request `total` cap in the response. Change:
```ts
  return NextResponse.json({ activities: activities.slice(0, TOTAL), roles, teams });
```
to:
```ts
  return NextResponse.json({ activities: activities.slice(0, total), roles, teams });
```

- [ ] **Step 6: Verify build + full test run**

Run: `npm run build && npx vitest run`
Expected: build succeeds; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/admin/activity/route.ts src/lib/activity.ts src/__tests__/activity.test.ts
git commit -m "feat: per-person filter and audit-log source in activity feed"
```

---

## Task 7: Rate-limit the admin mutation routes

**Files:**
- Modify: `src/app/api/admin/users/route.ts`
- Modify: `src/app/api/admin/overtime-requests/route.ts`

- [ ] **Step 1: Limit POST/PATCH in users route**

In `src/app/api/admin/users/route.ts` add the import:
```ts
import { enforceRateLimit, keyByUser } from '@/lib/rate-limit';
```
In POST, right after `const session = await requireAdmin();` add:
```ts
  await enforceRateLimit({ key: keyByUser('admin-users-write', session.id), limit: 30, windowSeconds: 60 });
```
In PATCH, after `const session = await requireAdmin();` add the same line.

- [ ] **Step 2: Limit POST in overtime-requests route**

In `src/app/api/admin/overtime-requests/route.ts` add the import:
```ts
import { enforceRateLimit, keyByUser } from '@/lib/rate-limit';
```
In POST, right after `const session = await requireAdmin();` add:
```ts
  await enforceRateLimit({ key: keyByUser('admin-overtime-write', session.id), limit: 60, windowSeconds: 60 });
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/users/route.ts src/app/api/admin/overtime-requests/route.ts
git commit -m "feat: rate-limit admin user and overtime mutation routes"
```

---

## Task 8: Rate-limit the public routes (per-IP)

**Files:**
- Modify: `src/app/api/public/applications/[positionId]/route.ts`
- Modify: `src/app/api/public/talents/confirm/[token]/route.ts`
- Modify: `src/app/api/public/talents/revoke/[token]/route.ts`

These are raw handlers (no `route()` wrapper), so use the non-throwing `checkRateLimit`.

- [ ] **Step 1: Limit the public applications POST**

In `src/app/api/public/applications/[positionId]/route.ts` add the import:
```ts
import { checkRateLimit, keyByIp, clientIp } from '@/lib/rate-limit';
```
Immediately inside `export async function POST(...) {`, before the `expected` token check, add:
```ts
  const rl = await checkRateLimit({ key: keyByIp('apply', clientIp(req)), limit: 5, windowSeconds: 60 });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, code: 'RATE_LIMITED', error: 'Too many submissions. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }
```

- [ ] **Step 2: Limit the talents confirm GET**

In `src/app/api/public/talents/confirm/[token]/route.ts` add the import:
```ts
import { checkRateLimit, keyByIp } from '@/lib/rate-limit';
```
Inside `export async function GET(...)`, right after `const { token } = await ctx.params;`, add:
```ts
  const rl = await checkRateLimit({ key: keyByIp('talent-confirm', clientIpFrom(req.headers)), limit: 10, windowSeconds: 60 });
  if (!rl.ok) {
    return html(consentHtmlPage({
      variant: 'neutral',
      heading: 'Please slow down',
      message: 'Too many requests from your network. Please wait a minute and try the link again.',
    }), 429);
  }
```
(`clientIpFrom` and `consentHtmlPage`/`html` are already imported/defined in this file.)

- [ ] **Step 3: Limit the talents revoke GET**

Open `src/app/api/public/talents/revoke/[token]/route.ts`. Add the import:
```ts
import { checkRateLimit, keyByIp } from '@/lib/rate-limit';
```
Inside its `GET` handler, right after the token is read from `ctx.params`, add the same guard as Step 2 but with `keyByIp('talent-revoke', clientIpFrom(req.headers))`. (This file already imports `clientIpFrom` and has an `html()`/`consentHtmlPage` pattern — mirror Step 2's block. If a helper name differs, match the file's existing HTML-response helper.)

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/public/applications/[positionId]/route.ts" "src/app/api/public/talents/confirm/[token]/route.ts" "src/app/api/public/talents/revoke/[token]/route.ts"
git commit -m "feat: per-IP rate-limit public application and talent-consent routes"
```

---

## Task 9: Prune stale rate-limit windows in the cron

**Files:**
- Modify: `src/app/api/cron/auto-clock-out/route.ts`

- [ ] **Step 1: Add the prune**

Add imports:
```ts
import { lt } from 'drizzle-orm';
import { db } from '@/db';
import { rateLimits } from '@/db/schema';
```
In the `GET` handler, after `const result = await sweepOpenSessions(admin, now);` add:
```ts
  // Best-effort prune of rate-limit windows older than a day.
  try {
    const cutoff = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
    await db.delete(rateLimits).where(lt(rateLimits.windowStart, cutoff));
  } catch (err) {
    console.error('[cron] rate_limits prune failed:', err);
  }
```

- [ ] **Step 2: Verify build + tests**

Run: `npm run build && npx vitest run`
Expected: success; all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/auto-clock-out/route.ts
git commit -m "chore: prune stale rate_limits rows in daily cron"
```

---

## Task 10: Two-pane per-person activity panel

**Files:**
- Modify: `src/components/users-admin-tabs.tsx:36-37`
- Modify: `src/components/user-activity-panel.tsx` (full rewrite)

- [ ] **Step 1: Pass users into the panel**

In `src/components/users-admin-tabs.tsx`, change:
```tsx
      {tab === 'manage'
        ? <UserManagementTable initialUsers={initialUsers} currentUserId={currentUserId} />
        : <UserActivityPanel />}
```
to:
```tsx
      {tab === 'manage'
        ? <UserManagementTable initialUsers={initialUsers} currentUserId={currentUserId} />
        : <UserActivityPanel users={initialUsers} />}
```

- [ ] **Step 2: Rewrite `src/components/user-activity-panel.tsx`**

Replace the entire file with:
```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Loader2, CheckSquare, FileText, Clock, CalendarCheck, BellRing, ShieldCheck,
  Activity as ActivityIcon, Search, Users as UsersIcon,
} from 'lucide-react';
import { roleLabel, type AppRole } from '@/lib/rbac';
import type { UserRow } from '@/components/user-management-table';

type ActivityType = 'ticket' | 'report' | 'clock' | 'attendance' | 'ping' | 'admin';

interface ActivityItem {
  id: string;
  userId: number;
  userName: string;
  role: AppRole;
  team: string | null;
  type: ActivityType;
  description: string;
  at: string;
}

const TYPE_META: Record<ActivityType, { icon: typeof Clock; tint: string }> = {
  ticket:     { icon: CheckSquare,   tint: 'bg-(--rs-primary-50) text-(--rs-primary-600)' },
  report:     { icon: FileText,      tint: 'bg-amber-50 text-amber-600' },
  clock:      { icon: Clock,         tint: 'bg-emerald-50 text-emerald-600' },
  attendance: { icon: CalendarCheck, tint: 'bg-violet-50 text-violet-600' },
  ping:       { icon: BellRing,      tint: 'bg-rose-50 text-rose-600' },
  admin:      { icon: ShieldCheck,   tint: 'bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-700)' },
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function UserActivityPanel({ users }: { users: UserRow[] }) {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null); // null = Everyone
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [items, setItems]     = useState<ActivityItem[]>([]);
  const [roles, setRoles]     = useState<AppRole[]>([]);
  const [teams, setTeams]     = useState<string[]>([]);
  const [roleFilter, setRoleFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const url = selectedUserId == null
      ? '/api/admin/activity'
      : `/api/admin/activity?userId=${selectedUserId}`;
    fetch(url)
      .then(r => r.json())
      .then((d: { activities?: ActivityItem[]; roles?: AppRole[]; teams?: AppRole[] | string[]; error?: string }) => {
        if (cancelled) return;
        if (d.error) { setError(d.error); setItems([]); return; }
        setItems(d.activities ?? []);
        setRoles((d.roles ?? []) as AppRole[]);
        setTeams((d.teams ?? []) as string[]);
      })
      .catch(() => { if (!cancelled) setError('Failed to load activity.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedUserId]);

  const roster = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...users]
      .filter(u => !q || u.name.toLowerCase().includes(q) || (u.team ?? '').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users, query]);

  const filtered = useMemo(
    () => items.filter(a =>
      (selectedUserId != null || !roleFilter || a.role === roleFilter) &&
      (selectedUserId != null || !teamFilter || a.team === teamFilter)),
    [items, roleFilter, teamFilter, selectedUserId],
  );

  const selectedUser = selectedUserId == null ? null : users.find(u => u.id === selectedUserId) ?? null;
  const selectCls = 'rounded-md border border-(--rs-neutral-grey-200) bg-white px-2.5 py-1.5 text-sm text-(--rs-neutral-grey-700) focus:outline-none focus:border-(--rs-primary-500) focus:ring-2 focus:ring-(--rs-primary-100)';

  function rosterButton(id: number | null, label: string, sub?: string) {
    const active = selectedUserId === id;
    return (
      <button
        key={id ?? 'everyone'}
        onClick={() => setSelectedUserId(id)}
        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-300) ${
          active
            ? 'bg-(--rs-primary-50) text-(--rs-primary-700) font-semibold'
            : 'text-(--rs-neutral-grey-700) hover:bg-(--rs-neutral-grey-50)'
        }`}
      >
        <span className="block truncate">{label}</span>
        {sub && <span className="block truncate text-[11px] text-(--rs-neutral-grey-400)">{sub}</span>}
      </button>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
      {/* Roster (desktop) */}
      <aside className="hidden md:flex md:flex-col rounded-xl border border-(--rs-neutral-grey-200) bg-white">
        <div className="p-2 border-b border-(--rs-neutral-grey-100)">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-(--rs-neutral-grey-400)" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search people…"
              aria-label="Search people"
              className="w-full rounded-md border border-(--rs-neutral-grey-200) bg-white pl-8 pr-2 py-1.5 text-sm focus:outline-none focus:border-(--rs-primary-500) focus:ring-2 focus:ring-(--rs-primary-100)"
            />
          </div>
        </div>
        <div className="p-1.5 overflow-y-auto max-h-[28rem] space-y-0.5">
          {rosterButton(null, 'Everyone', 'All recent activity')}
          {roster.map(u =>
            rosterButton(u.id, u.isActive ? u.name : `${u.name} (inactive)`,
              [roleLabel(u.role as AppRole), u.team].filter(Boolean).join(' · ')))}
        </div>
      </aside>

      {/* Roster (mobile) */}
      <div className="md:hidden">
        <label htmlFor="activity-person" className="sr-only">Select person</label>
        <select
          id="activity-person"
          value={selectedUserId ?? ''}
          onChange={e => setSelectedUserId(e.target.value === '' ? null : Number(e.target.value))}
          className={`${selectCls} w-full`}
        >
          <option value="">Everyone</option>
          {roster.map(u => (
            <option key={u.id} value={u.id}>{u.isActive ? u.name : `${u.name} (inactive)`}</option>
          ))}
        </select>
      </div>

      {/* Timeline */}
      <section className="space-y-4 min-w-0">
        {selectedUser ? (
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-(--rs-primary-50) text-(--rs-primary-600)">
              <UsersIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-(--rs-neutral-grey-900) truncate">{selectedUser.name}</p>
              <p className="text-[11px] text-(--rs-neutral-grey-400) truncate">
                {[roleLabel(selectedUser.role as AppRole), selectedUser.team].filter(Boolean).join(' · ')}
              </p>
            </div>
            {!loading && !error && (
              <span className="ml-auto text-xs text-(--rs-neutral-grey-400)">{filtered.length} events</span>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-(--rs-neutral-grey-400)">Filter</label>
            <select aria-label="Filter by role" value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className={selectCls}>
              <option value="">All roles</option>
              {roles.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
            <select aria-label="Filter by team" value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className={selectCls}>
              <option value="">All teams</option>
              {teams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {(roleFilter || teamFilter) && (
              <button type="button" onClick={() => { setRoleFilter(''); setTeamFilter(''); }}
                className="text-xs text-(--rs-primary-600) hover:underline">Clear</button>
            )}
            {!loading && !error && (
              <span className="ml-auto text-xs text-(--rs-neutral-grey-400)">{filtered.length} of {items.length} events</span>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-(--rs-neutral-grey-500)">
            <Loader2 className="w-4 h-4 animate-spin" /><span className="text-sm">Loading activity…</span>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-(--rs-neutral-grey-200) py-12 text-(--rs-neutral-grey-400)">
            <ActivityIcon className="w-6 h-6" />
            <p className="text-sm">{items.length === 0 ? 'No recent activity.' : 'No activity matches this view.'}</p>
          </div>
        ) : (
          <ul className="rounded-xl border border-(--rs-neutral-grey-200) bg-white divide-y divide-(--rs-neutral-grey-100)">
            {filtered.map(a => {
              const meta = TYPE_META[a.type];
              const Icon = meta.icon;
              return (
                <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.tint}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-(--rs-neutral-grey-800)">
                      {selectedUser
                        ? a.description
                        : <><span className="font-semibold text-(--rs-neutral-grey-900)">{a.userName}</span> · {a.description}</>}
                    </p>
                    {!selectedUser && (
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-(--rs-neutral-grey-400)">
                        <span className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 font-medium text-(--rs-neutral-grey-600)">{roleLabel(a.role)}</span>
                        {a.team && <span className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 font-medium text-(--rs-neutral-grey-600)">{a.team}</span>}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-(--rs-neutral-grey-400) tabular-nums" title={new Date(a.at).toLocaleString()}>
                    {relativeTime(a.at)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Verify `UserRow` is exported**

Run: `grep -n "export type UserRow\|export interface UserRow" src/components/user-management-table.tsx`
Expected: a match. If `UserRow` is not exported, add `export` to its declaration.

- [ ] **Step 4: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: success, no warnings.

- [ ] **Step 5: Commit**

```bash
git add src/components/users-admin-tabs.tsx src/components/user-activity-panel.tsx
git commit -m "feat: per-person roster + timeline in Users activity tab"
```

---

## Task 11: Final verification

- [ ] **Step 1: Run the full gate**

Run: `npm run verify && npx vitest run`
Expected: lint clean, build succeeds, all tests pass.

- [ ] **Step 2: Manual smoke (optional, needs DB)**

Run `npm run dev`, sign in as admin → `/admin/users` → Activity tab:
- Roster shows "Everyone" + people; clicking a person loads only their events.
- Change another user's role in the Manage tab, return to Activity → that person's timeline shows "Changed a user's role (… → …)".
- Hammer a public route to confirm a `429` with `Retry-After`.

- [ ] **Step 3: Commit any cleanup**

```bash
git add -A && git commit -m "chore: finalize phase 1 activity + audit + rate limiting"
```

---

## Self-Review Notes (author)

- **Spec coverage:** per-person activity (T6, T10), audit log table+writes+feed (T1, T4, T5, T6), rate limiting table+lib+routes+cron (T1, T2, T3, T7, T8, T9), hardening (T2 no-leak via generic 429, T6 userId validation). ✅
- **Type consistency:** `checkRateLimit`/`enforceRateLimit`/`keyByUser`/`keyByIp`/`clientIp` (T3) used identically in T7/T8/T9; `AuditAction`/`deriveUserPatchAction`/`describeAudit` (T4) used in T5/T6; `parseActivityUserId` (T6) shape `{ok:true,userId}|{ok:false}` matches its test. ✅
- **Known follow-up:** Phase 2 — full ~51-route audit sweep (separate spec).
