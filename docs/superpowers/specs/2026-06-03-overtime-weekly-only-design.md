# Overtime — Weekly-Only Cap + Weekly OT Accounting — Design

**Date:** 2026-06-03
**Status:** Approved (pending spec review)
**Supersedes the per-session cap from:** `2026-06-02-overtime-admin-gate-design.md`

## Problem

The current model (shipped 2026-06-02) enforces a **hard 3h per-session cap**: a
session is auto-clocked-out the instant it hits 3 hours, and "overtime" for
reporting/pay means "the part of a session beyond 3h." Leadership wants the daily
ceiling gone — people may work more than 3h in a day — with **15h/week** as the
only working limit, and **overtime redefined as time worked beyond 15h/week.**

## Confirmed rules

1. **No per-session / per-day cap.** The 3h auto-clock-out is removed entirely.
2. **15h/week is the only working cap.** A running session is auto-cut when the
   week-to-date total would cross 15h; new clock-ins are blocked at ≥15h/week.
   (Already implemented — unchanged.)
3. **16h absolute safety ceiling** stays for every role (incl. admin) as the
   ghost-session guard. Unchanged.
4. **Admin exempt; an active admin approval suspends the weekly cap.** Unchanged.
5. **Overtime = time worked beyond 15h in a Mon–Sun week** (was: beyond 3h per
   session). Drives the saved `overtime_seconds` and every "OT" badge.
6. **Requests** = asking an admin to work past 15h/week. Existing flow, unchanged.

Net effect: overtime only ever accrues when an admin approval is active (because
without one, the session is cut at 15h). That is intended.

## Design — three tiers

### Tier 1 — Caps (pure logic)

`src/lib/overtime-policy.ts` — `decideAutoClockOut` drops the 3h step. New order:

1. invalid `clocked_in_at` → skip
2. `elapsed ≥ 16h` (SAFETY_CEILING_SECONDS) → close `'safety ceiling'` (all roles)
3. admin → skip `'admin exempt'`
4. active approval → skip `'approved overtime'`
5. `weekSecondsBefore + elapsed ≥ 15h` (WEEKLY_CAP_SECONDS) → close `'weekly cap'`
6. else → skip `'within limits'`

`decideClockInAllowed` is unchanged (already blocks at 15h/week unless admin/approved).
Remove the now-unused `OVERTIME_THRESHOLD_SECONDS` import and update the header comment.

### Tier 2 — Weekly OT accounting (the part that drives pay/reports)

`src/lib/utils.ts`:

- **Remove** `OVERTIME_THRESHOLD_SECONDS` (the 3h concept is gone).
- **`computeOvertime(weekSecondsBefore, durationSeconds)`** — overtime is the slice
  of this session lying beyond the 15h weekly cap:
  ```ts
  const overtimeSeconds = Math.max(
    0,
    Math.min(durationSeconds, weekSecondsBefore + durationSeconds - WEEKLY_CAP_SECONDS),
  );
  return { isOvertime: overtimeSeconds > 0, overtimeSeconds };
  ```
- **`isOvertime(weekSecondsTotal)`** — redefined to take a *week-to-date total*
  (incl. the live session) and return `weekSecondsTotal > WEEKLY_CAP_SECONDS`.
  (Was: session elapsed ≥ 3h.)

`src/lib/overtime-server.ts` — extend `weeklySecondsForUser(admin, userId, now, excludeTimesheetId?)`
so the admin-edit path can sum the week *excluding* the row being edited. Open
sessions (null duration) are already excluded, so clock-out / force-clock-out get
the correct "before this session" total for free.

Thread `weekSecondsBefore` into the **4 write paths**:

| Write path | How it gets `weekSecondsBefore` |
|---|---|
| `api/presence/clock-out/route.ts` | `weeklySecondsForUser(admin, userId, now)` (open row excluded by null duration) |
| `api/cron/auto-clock-out/route.ts` | already computes `weekSecByUserId` — pass it |
| `api/admin/timesheets/force-clock-out/route.ts` | `weeklySecondsForUser(admin, userId, now)` |
| `api/admin/timesheets/route.ts` (edit) | `weeklySecondsForUser(admin, userId, rowDate, excludeTimesheetId=rowId)` |

Historical `overtime_seconds` values are **not backfilled** (out of scope) — only
new writes use the weekly definition.

### Tier 3 — Weekly-accurate live badges (Approach A)

Add an optional **`weekSecondsBefore`** to `PresenceUser` (`src/lib/presence.ts`):
the user's completed week-to-date seconds, captured **once at clock-in** (it can't
change while the session is open). Clients compute `weekTotal = weekSecondsBefore +
liveElapsed` and badge OT via `isOvertime(weekTotal)`. This adds **no per-tick or
per-broadcast queries** — only one `weeklySecondsForUser` call when a session opens
or a snapshot is hydrated.

Population points for `weekSecondsBefore`:

- `api/presence/clock-in/route.ts` — compute and pass into `clockIn({...})`.
- `api/presence/route.ts` rehydration fallback + any post-restart `seedUsers`
  hydration — compute when re-seeding open sessions.

Consumers (replace `isOvertime(secs)` with `isOvertime(weekSecondsBefore + secs)`):

- `src/app/(app)/live/page.tsx` (`LiveDuration`) — uses `user.weekSecondsBefore`.
- `src/components/who-is-in-panel.tsx`
- `src/components/presence-panel.tsx`
- `src/components/clock-widget.tsx` — see below.
- `src/components/overtime-status-banner.tsx` — `overtimeSeconds = max(0, weekTotal − 15h)`;
  reword "… over · … total this session" to a weekly framing.

**Clock widget guardrail** (`clock-widget.tsx`): the browser mirror currently
auto-clocks-out and shows the guardrail dialog when the *session* hits 3h. Change
it to fire when **`weekTotal ≥ 15h`** instead (using `weekSecondsBefore` delivered
in the presence/clock-in payload), and show a "time remaining until your 15h weekly
limit" hint. The dialog still routes to **Request overtime**.

**Guardrail dialog** (`overtime-guardrail-dialog.tsx`): re-label "3-hour limit
reached" → "Weekly 15-hour limit reached"; drop the "3-hour per-session limit"
sentence, keep the weekly limit + request copy.

### Copy / comment cleanups

- `src/app/(app)/admin/overtime/page.tsx` — "auto-clocked-out at 3 hours per
  session and 15 hours per week" → weekly only.
- `api/cron/auto-clock-out/route.ts` header comment — drop the 3h bullet.
- `src/db/schema.ts` `overtime_requests` comment — "cut at the 3h/15h cap" → "15h weekly cap".

## Tests

- `src/__tests__/overtime-policy.test.ts` — delete the "session 3h cap" describe
  block; update the weekly-cap case that references "even under the 3h session cap";
  keep safety-ceiling / admin / approval / weekly-cap cases.
- `src/__tests__/overtime.test.ts` — rewrite for the new signatures:
  `computeOvertime(weekSecondsBefore, duration)` weekly slicing (under cap → 0;
  straddling 15h → only the slice past 15h; fully past 15h → whole session);
  `isOvertime(weekTotal)` boundary at 15h; remove the `OVERTIME_THRESHOLD_SECONDS`
  assertions.

## Out of scope

- Backfilling/re-deriving `overtime_seconds` on historical timesheets.
- Any DB schema change (the `overtime_seconds` / `is_overtime` columns stay; only
  their computed meaning changes).
- Per-day caps or per-hour granular approvals.
- Touching the SSE broadcast cadence (only a static field is added to the payload).
