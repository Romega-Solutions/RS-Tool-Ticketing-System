# Per-person activity + audit log + rate limiting — Phase 1 design

**Date:** 2026-06-18
**Status:** Approved (design)
**Scope:** Admin → User Management activity, a real admin-action audit trail, and a
Supabase-backed API rate limiter applied to the highest-risk routes.

> This is **Phase 1**. The full sweep of all ~51 API routes is explicitly deferred to a
> separate Phase 2 spec that will reuse the primitives built here.

---

## Goals

1. In **Admin → Users → Activity**, let an admin pick a person and see *all of that
   person's activity* in a dedicated timeline (today you can only filter by role/team).
2. Add a **real audit trail** for admin actions (user create / role change /
   deactivate / reactivate) — currently these are not recorded anywhere.
3. Add **rate limiting** that actually works on Vercel's serverless runtime, applied to
   the highest-abuse surfaces.
4. **Harden** the activity/users endpoints (input validation, no DB-error leakage,
   consistent admin guards).

## Non-goals (Phase 2)

- A full audit/rate-limit sweep of every API route.
- Rotating to Redis/Upstash/Vercel KV (Supabase table is sufficient here).
- Surfacing "actions performed *on* a user" in their panel — the timeline is
  **actor-based** (actions the person performed), consistent with the existing feed.

---

## 1. Per-person activity (People list + detail panel)

### UI — `src/components/user-activity-panel.tsx` + `users-admin-tabs.tsx`
- `UsersAdminTabs` already has `initialUsers`; pass them into `UserActivityPanel` so the
  roster needs no extra fetch.
- Two-pane layout:
  - **Left:** searchable roster. Top entry **"Everyone"** = the existing global feed.
    Each person row: name · role badge · team. Includes inactive users (greyed).
  - **Right:** the selected person's timeline, reusing the current item rendering and the
    per-type filter. Header shows the person's name/role/team.
- Selecting a person fetches `GET /api/admin/activity?userId=<id>`; "Everyone" fetches
  `GET /api/admin/activity` (current behavior). Loading/empty/error states reuse the
  existing patterns.
- **Responsive:** below `md`, the roster collapses to a `<select>` above the timeline.

### API — `src/app/api/admin/activity/route.ts`
- Accept optional `?userId=<int>`.
  - Validate: must parse to a positive integer and exist in `users`; otherwise `400`.
  - When present: every source query is filtered to that user
    (`work_item_activity.actor_id`, `weekly_reports.user_id`, `timesheets.user_id`,
    `attendance.edited_by`, `presence_pings.from_user_id`, `audit_log.actor_id`),
    `PER_SOURCE` raised for a single-user view, total capped at **300**.
  - When absent: unchanged global feed (latest 150).
- Still `requireAdmin()`. `roles`/`teams` filter lists are only computed for the global
  view.

---

## 2. Audit log

### Table `audit_log`
| column | type | notes |
|---|---|---|
| `id` | `serial` PK | |
| `actor_id` | `integer NOT NULL` | the admin who performed the action (FK-by-convention to `users.id`; no hard FK, matching repo style) |
| `action` | `text NOT NULL` | `user.created` \| `user.role_changed` \| `user.deactivated` \| `user.reactivated` \| `user.updated` |
| `target_user_id` | `integer` | the affected user |
| `details` | `jsonb` | e.g. `{ "from": "ic", "to": "lead" }` |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |

Indexes: `(created_at DESC)`, `(actor_id)`.

### Helper — `src/lib/audit.ts`
```ts
recordAudit({ actorId, action, targetUserId, details }): Promise<void>
```
Best-effort: wraps the insert in try/catch, `console.error` on failure, **never throws**
(an audit write must not break the user-management action it records).

### Writes — `src/app/api/admin/users/route.ts`
- `POST` success → `user.created` (`targetUserId` = new user, `details` = `{role, team}`).
- `PATCH` success → derive the action from the diff:
  - `is_active` 1→0 ⇒ `user.deactivated`; 0→1 ⇒ `user.reactivated`
  - `role` changed ⇒ `user.role_changed` (`details {from,to}`)
  - otherwise ⇒ `user.updated` (`details` = changed keys)
  Captured **before** the update so we have the prior values.

### Feed integration — 6th source in `/api/admin/activity`
Read `audit_log` (filtered by `actor_id` in per-person mode), attribute to `actor_id`,
render via `describeAudit(action, details)`. New `ActivityType = 'admin'` with its own
icon/tint in the panel's `TYPE_META`.

---

## 3. Rate limiting

### Table `rate_limits`
| column | type | notes |
|---|---|---|
| `key` | `text NOT NULL` | `"<routeTag>:<identifier>"` |
| `window_start` | `timestamptz NOT NULL` | start of the fixed window |
| `count` | `integer NOT NULL DEFAULT 0` | hits in this window |

Primary key: `(key, window_start)`.

### Helper — `src/lib/rate-limit.ts`
```ts
enforceRateLimit({ key, limit, windowSeconds }): Promise<void>
keyByUser(routeTag: string, userId: number): string
keyByIp(routeTag: string, ip: string): string
clientIp(req: Request): string         // x-forwarded-for → x-real-ip → 'unknown'
```
- `windowStart = floor(now / windowMs) * windowMs`.
- **Atomic** increment via the existing `postgres-js`/drizzle `db` client:
  `insert(rateLimits).values({key, windowStart, count: 1})
   .onConflictDoUpdate({ target: [key, windowStart], set: { count: sql`${rateLimits.count} + 1` } })
   .returning({ count })`.
  Atomicity is at the DB, so it is correct across serverless instances.
- If `count > limit` → throw `tooManyRequests(retryAfterSec)` where
  `retryAfterSec = windowSeconds - (nowSec % windowSeconds)`.
- If the limiter's own DB call fails, **fail open** (log + allow) so a limiter outage
  can't take down the app.

### Errors / wrapper
- `src/lib/api/errors.ts`: add `HttpError` optional `headers?: Record<string,string>` and
  `tooManyRequests(retryAfterSec)` → `429` with `Retry-After`.
- `src/lib/api/route.ts`: when a caught `HttpError` carries `headers`, apply them to the
  `NextResponse`.

### Applied routes (limits are starting values, tunable)
| Route | Identifier | Limit |
|---|---|---|
| `POST/PATCH /api/admin/users` | per-admin user id | 30 / 60s |
| `POST /api/admin/overtime-requests` | per-admin user id | 60 / 60s |
| `POST /api/public/applications/[positionId]` | per-IP | 5 / 60s |
| `POST /api/public/talents/confirm|revoke/[token]` | per-IP | 10 / 60s |

### Cleanup
Stale windows are pruned in the existing daily cron
(`/api/cron/auto-clock-out` → add a `DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`).

---

## 4. Endpoint hardening
- Activity route: reject non-integer `userId` (`400`), cap any pagination input.
- No raw PostgREST/DB error strings in responses — generic client message, real error to
  `console.error`.
- Re-verify `requireAdmin()` on every admin route touched.

---

## 5. Data model / migrations
- Add `auditLog` and `rateLimits` `pgTable`s to `src/db/schema.ts`.
- `npx drizzle-kit generate` → migration in `drizzle/`.
- Hand-written `docs/migrations/add-audit-log-and-rate-limits.sql` (repo convention).
- ⚠️ Prod apply may require the **direct DB connection** — the pooler `DATABASE_URL`
  creds have been stale before. Verify column presence with a service-role head-probe.

---

## 6. Testing (vitest, pure-helper convention)
- `src/lib/rate-limit.ts`: window-start calc, `keyByUser`/`keyByIp`, `clientIp` parsing,
  `retryAfter` math, over-limit threshold (pass a stubbed counter).
- `src/lib/audit.ts`: `describeAudit(action, details)` strings; PATCH action-derivation
  from a diff (extract that into a pure helper).
- Activity route: `userId` param validation (pure parse/validate helper).
- DB round-trips are not unit-tested (no DB in CI), matching the existing suite.

---

## 7. File touch list
- **New:** `src/lib/rate-limit.ts`, `src/lib/audit.ts`,
  `docs/migrations/add-audit-log-and-rate-limits.sql`, tests under `src/__tests__/`.
- **Edit:** `src/db/schema.ts`, `src/lib/api/errors.ts`, `src/lib/api/route.ts`,
  `src/app/api/admin/activity/route.ts`, `src/app/api/admin/users/route.ts`,
  `src/app/api/admin/overtime-requests/route.ts`,
  `src/app/api/public/applications/[positionId]/route.ts`,
  `src/app/api/public/talents/confirm/[token]/route.ts`,
  `src/app/api/public/talents/revoke/[token]/route.ts`,
  `src/app/api/cron/auto-clock-out/route.ts`,
  `src/components/users-admin-tabs.tsx`, `src/components/user-activity-panel.tsx`.

## 8. Risks
- **Rate-limit table write on the hot path** adds one DB round-trip per limited request;
  acceptable on the chosen low-traffic surfaces, and it fails open.
- **Migration drift** between Drizzle and the hand-written SQL — keep them identical.
- **Fixed-window edge bursts** (2× limit across a boundary) accepted for Phase 1;
  sliding window is a possible later refinement.
