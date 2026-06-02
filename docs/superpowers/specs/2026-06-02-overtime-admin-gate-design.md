# Overtime Admin Gate + Weekly Cap — Design

**Date:** 2026-06-02
**Status:** Approved (Approach 1, enforcement-first)

## Problem

Today a contractor **self-approves** overtime: at 3h the browser prompts "Yes,
continue working" → `overtime-consent` sets `overtime_consent_until = now+1h`,
and the cron only cuts a session ≥ 3h + 5min with no active self-consent. There
is **no weekly cap**. Leadership wants overtime gated behind an **admin**, the
3h session cap to hard-stop, and a 15h/week ceiling.

## Rules

- **Per-session cap = 3h** (`OVERTIME_THRESHOLD_SECONDS`, 10800s). At 3h the
  session is **hard auto-cut immediately** — no 5-min grace, no self-consent.
- **Weekly cap = 15h** (`WEEKLY_CAP_SECONDS`, 54000s), Monday–Sunday, summed
  from `timesheets.duration_seconds` for the week + the current open session's
  elapsed time. At/over 15h: new clock-ins are blocked and a running session is
  cut when it would cross 15h.
- **Admin is the only exemption.** `ic` and `lead` are fully enforced; `admin`
  (normalized — includes ceo/owner/superadmin) is exempt from the 3h cut, the
  weekly cap, and the request gate.
- **Safety ceiling = 16h** (`SAFETY_CEILING_SECONDS`, 57600s) applies to **all
  roles incl. admin** — prevents the "ghost" open-session problem that the May
  fix addressed when it removed the admin exemption.
- An **active admin approval** (`approved_until` in the future) suspends both
  the 3h and 15h caps for that user until it expires.

## Data

New table `overtime_requests`:
`id, user_id, week_start (Mon, text), status ('pending'|'approved'|'denied'),
reason (text, null), requested_at, decided_by (user id, null),
decided_at (null), approved_until (timestamptz, null)`.
Migration SQL in `docs/migrations/`. Approving sets `status='approved'`,
`decided_by`, `decided_at`, and `approved_until` (default: end of the requester's
local day).

## Pure core — `src/lib/overtime-policy.ts` (replaces `auto-clock-out.ts`)

All thresholds + decisions, unit-tested, no I/O:

- `decideAutoClockOut({ role, clockedInAt, weekSecondsBefore, approvedUntil, now })`
  → `{ action: 'skip', reason }` | `{ action: 'close', elapsedSec, reason }`.
  Order: invalid timestamp → skip; elapsed ≥ 16h safety → close (all roles);
  admin → skip; active approval → skip; elapsed ≥ 3h → close('session cap');
  weekSecondsBefore + elapsed ≥ 15h → close('weekly cap'); else skip.
- `decideClockInAllowed({ role, weekSecondsBefore, approvedUntil, now })`
  → `{ allowed: true }` | `{ allowed: false, reason }`. Admin/active-approval →
  allowed; weekSecondsBefore ≥ 15h → blocked; else allowed.
- `weekStartMonday(date) → 'YYYY-MM-DD'` helper.

## Enforcement points

| Where | Change |
|---|---|
| `api/cron/auto-clock-out` | use new helper; fetch each user's week seconds + active approval; cut at 3h / 15h / 16h |
| `api/presence/clock-in` | block when `decideClockInAllowed` is false (weekly cap, no approval) |
| `api/presence/overtime-consent` | **removed** (self-consent gone) |
| `api/presence/overtime-request` (new, contractor) | create a pending request for the current week |
| `api/admin/overtime-requests` (new) | GET list (pending + recent) · POST approve/deny (admin only) |
| Clock widget / guardrail | replace "Yes, continue working" with "Request overtime" + show request status |
| Admin surface | compact pending-requests list with Approve/Deny |

## Out of scope
- Per-hour granular approvals (approval is a time window to end-of-day).
- Backfilling/retro-editing past overtime.
