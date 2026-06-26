# Approved Hours + Work Schedule + User-Management polish — Design

**Date:** 2026-06-26
**Status:** Approved scope, pending spec review
**Author:** Ken Garcia (with Claude)

## 1. Context — why this spec is only a *delta*

Most of the original request is **already implemented in the uncommitted working tree** and is treated here as the existing foundation (not to be rebuilt or, per the agreed scope, committed by this work):

- **Overtime/attendance (Part 1) — done in WIP.** `overtime-status-banner.tsx` deleted; the clock widget shows calm "Clocked in · mm:ss" with a budget bar that reads "Limit reached" at the ceiling (no "OT" badge). The engine runs on a per-week **allowance** model (`15h base + bounded grants`) threaded through `presence`, `clock-in`, the cron sweep, and the attendance API. The attendance weekly tab live-ticks `total / allotted` with a green "live" dot.
- **My Time / nav (Part 2) — done in WIP.** `/my-time` is two tabs — **Logins** + **Time Request** (pending badge). The standalone "Time Requests" sidebar item was removed and re-added as **"Time Approvals"** under Team Tools (gated by `attendance` access).

**The one hardcoded value left is the 15h base** (`WEEKLY_CAP_SECONDS`), seeded everywhere an allowance/cap is computed. This spec covers the genuinely-remaining work:

1. **Admin ▸ User Management additions** (greenfield): Approved Hours, Schedule PHT (editable) + Schedule PST (derived, DST-aware), clickable-name profile popup, column show/hide filter.
2. **Wire each user's Approved Hours in as that 15h base** — the link that makes the new column actually "connected to timekeeping," at **full depth** (allotted display, clock-in gate, budget bar, *and* payroll overtime). Default `15` ⇒ behavior is byte-identical for every existing user.

### Out of scope (explicit)
- The unrelated **Done-column archive** WIP also present in the tree (kanban, task sheet, archive cron) — untouched, not committed.
- **Committing/deploying** the existing Part 1/2 WIP — left as foundation.
- **Monthly** attendance tab "allotted" — "allotted" is a weekly concept; monthly stays total-only.
- **Per-weekday** schedules — a single daily range per user only.
- Applying the DB migration to **production** — written here, but applying it is a separate, explicitly-gated step.

## 2. Data model

Add three columns to `users` in `src/db/schema.ts`:

| Column | Type | Notes |
|--------|------|-------|
| `approved_hours_per_week` | `integer NOT NULL DEFAULT 15` | Weekly allotted hours; the per-user base cap. |
| `schedule_pht_start` | `text` (nullable) | `"HH:MM"` 24h, PHT. |
| `schedule_pht_end` | `text` (nullable) | `"HH:MM"` 24h, PHT. |

**Schedule PST is never stored** — it is derived on render from the PHT range (§4), so it can never drift and always reflects current DST.

**Migration.** `schema.ts` is known to be drifted from the live DB, so **do not run `drizzle-kit generate`.** Hand-write `drizzle/0007_user_approved_hours_schedule.sql`:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_hours_per_week integer NOT NULL DEFAULT 15;
ALTER TABLE users ADD COLUMN IF NOT EXISTS schedule_pht_start text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS schedule_pht_end  text;
```

Additive and idempotent. Apply via the established `scripts/apply-migration.ts` direct-connection path (the pooler can't run DDL) — **gated on explicit go-ahead** for dev and prod. Until applied, the §3 helpers fall back to 15h, so nothing breaks.

## 3. Approved Hours → allowance base (full-depth wiring)

The base weekly seconds become per-user. **Grants still stack on top and still count as overtime** — only the *base* changes from a flat 15h to the user's approved hours.

### New helpers — `src/lib/overtime-server.ts`
```ts
// users.approved_hours_per_week × 3600; falls back to WEEKLY_CAP_SECONDS (15h)
// when the column is absent/null or the lookup fails (resilient pre-migration).
baseWeeklySecondsForUser(admin, userId): Promise<number>
baseWeeklySecondsForUsers(admin, userIds): Promise<Map<number, number>>
```

### Edits — base now comes from the helper, not the constant
- `weeklyAllowanceForUser` → `base(user) + grants(user)`.
- `weeklyAllowanceForUsers` → seed each id with `base(id)` (was `WEEKLY_CAP_SECONDS`), then add grants.
- `enforceUserOpenSession` and `sweepOpenSessions` → fetch base(s) and pass `baseSeconds` into `planEnforcement` (so the OT slice is measured against the user's base).
- `src/app/api/attendance/route.ts` → seed `allowanceByUser[id]` from the user's approved hours (add `approved_hours_per_week` to the existing `teamUsers` select), then add grants as today. The "allotted" denominator therefore = approved hours (+ any grant), which is exactly the "calm" behavior: a granted user reads `16:00 / 17:00`, never "over."

### Pure-function param additions (default = `WEEKLY_CAP_SECONDS`, preserving back-compat)
- `src/lib/utils.ts`: `isOvertime(total, capSeconds?)`, `computeOvertime(weekSecondsBefore, durationSeconds, baseSeconds?)`.
- `src/lib/overtime-policy.ts`: `AutoClockOutInput.baseSeconds?` → `planEnforcement` forwards it to `computeOvertime`.

### Caller updates (pass the user's base)
- `computeOvertime` callers: `presence/clock-out`, `admin/timesheets`, `admin/timesheets/force-clock-out`, `attendance/edit-requests` — each already has the relevant `user_id`/session; fetch base and pass it.
- `isOvertime` "over" indicators: `live/page.tsx`, `presence-panel.tsx`, `who-is-in-panel.tsx` — plumb each user's approved hours into the per-user data these render so the amber "over" tint uses the user's base. (If a panel's data source makes this disproportionately costly, note it in the plan and keep the 15h default for that panel only — these are soft visual cues, not enforcement.)

`weeklyBudget` already accepts `capSeconds`; the clock widget already receives `weekAllowanceSeconds` from `/api/presence`. Because that endpoint uses `weeklyAllowanceForUser`, the personal budget bar becomes per-user automatically once the helper changes — **no clock-widget edit required.**

## 4. Schedule PHT ↔ PST (DST-aware, 15-year-safe)

**Approach (chosen): native `Intl` + IANA `America/Los_Angeles`.** The tz database already encodes every scheduled US DST transition; no hand-maintained rules, no new dependency, and a future tz-data update covers any law change. Rejected: hand-coding the 2nd-Sun-Mar→1st-Sun-Nov rule (re-implements the tz db; brittle) and storing a static PST string (can't follow DST).

### Pure helper — `src/lib/schedule.ts`
```ts
// Convert a PHT "HH:MM" wall-clock time to the equivalent US Pacific wall-clock
// time for `refDate` (default: now). DST-aware. Returns e.g. { time:"05:00", zone:"PST" }.
phtToPacific(hhmm: string, refDate?: Date): { time: string; zone: 'PST' | 'PDT' }

// Format a PHT range for display, both sides: "21:00 - 00:00".
formatPhtRange(start, end): string
// Derive the Pacific range + zone for display: "05:00 - 08:00" + "PST".
pacificRange(start, end, refDate?): { range: string; zone: 'PST' | 'PDT' } | null
```

**Mechanics.** Build the instant `new Date(\`${Y}-${M}-${D}T${HH}:${MM}:00+08:00\`)` using `refDate`'s Y-M-D, then format it with `Intl.DateTimeFormat('en-US', { timeZone:'America/Los_Angeles', hour12:false, hour:'2-digit', minute:'2-digit' })`. Zone label from the same formatter with `timeZoneName:'short'`. Winter ⇒ 16h behind PHT (PST), summer ⇒ 15h (PDT). `refDate = now` makes the displayed PST auto-shift across the two DST boundaries each year.

**Endpoints converted independently** (constant offset within a day). The only imperfect case is the ~2 transition days/year where a range straddles 02:00 Pacific; negligible for a recurring schedule display — noted, not handled.

**Display is derived** (browser-side in the table/popup) — PST is read-only, shown as `05:00 - 08:00` with a small `PST`/`PDT` tag.

## 5. Admin ▸ User Management UI — `src/components/user-management-table.tsx` (+ page + API)

### 5.1 New columns
- **Approved Hours** — display `15 hrs`; editable number (inline edit + Add User), sensible bound (1–60), default 15. Sortable.
- **Schedule PHT** — display `21:00 - 00:00`; editable as two `<input type="time">` (start/end) in inline edit + Add User.
- **Schedule PST** — derived (§4), read-only, with `PST`/`PDT` tag.

`UserRow`, the `admin/users/page.tsx` select, and `api/admin/users` POST/PATCH all gain `approvedHoursPerWeek`, `schedulePhtStart`, `schedulePhtEnd` (with `parseApprovedHours` / `parseHhmm` validators, mirroring the existing `parseDate`/`parseDriveUrl` helpers). Keep the `supabase-write-columns.test.ts` guard green.

### 5.2 Column show/hide filter
A **"Columns"** button opens a tick-box menu (one per optional column). **Default visible: Name, Role, Team, Active, Approved Hours.** Hidden by default: Birth Date, Start Date, End Date, File, Member Code, Rate, Schedule PHT, Schedule PST. **Name and Actions are always shown.** Selection persisted in `localStorage` (`usersTableColumns:v1`), mirroring the existing `taskPanelWidth` pattern — no schema/API change. This directly serves the "avoid overcrowding" goal: the table opens compact, the rest is opt-in.

### 5.3 Clickable name → profile popup
The name cell becomes a `button` styled as normal text (not a blue link): `cursor-pointer` + hover underline. Click opens a Base UI **`Dialog`** showing the **full** record (every field incl. hidden columns + derived PST). Read-only, with an **Edit** button that closes the dialog and enters the existing inline-edit row. This is how hidden info stays reachable without un-hiding columns.

## 6. Testing
- **`src/__tests__/schedule.test.ts`** (new): `phtToPacific` for a winter date (PST, 16h) and summer date (PDT, 15h); future years across the next 15 (e.g. 2027, 2031, 2035, 2040) to prove IANA coverage; a midnight-crossing range (`21:00–00:00`).
- **`overtime.test.ts` / `overtime-policy.test.ts`** (extend): `isOvertime` / `computeOvertime` / `planEnforcement` with a non-default base (e.g. 20h approved ⇒ OT only beyond 20h); assert the default still equals 15h.
- **`supabase-write-columns.test.ts`** (extend): include the three new user columns.
- All existing tests must stay green (default-15 back-compat is the contract).
- **Verify gate:** `npm run verify` (lint + build) + `npm test`.

## 7. Rollout
1. `schema.ts` + hand-written `drizzle/0007_*.sql`.
2. Code changes (§3–§5) + tests (§6).
3. `npm run verify` && `npm test` green.
4. **Gated:** apply `drizzle/0007` to dev, then prod, via `scripts/apply-migration.ts`.
5. No commits by this work (per scope) — changes left in the working tree for review.
