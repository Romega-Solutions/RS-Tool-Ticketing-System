# Overtime Auto-Clockout — Audit Reference

**RS Ticketing System — Internal Feature Audit**
*Last updated: 2026-05-27*

---

## Purpose

The overtime guardrail (shipped 2026-05-21) closes a user's session if they stay clocked in past **3 hours** and ignore the blocking modal for another **5 minutes**. Enforcement runs in two places — the browser timer and a server cron — and that split is exactly where bugs hide.

This file does two things:

1. Maps the feature so any reviewer can find the moving parts fast.
2. Gives you a **copy-paste audit prompt** in section 3 that you can hand to Claude (or any coding agent) whenever you want a deep re-check — no need to re-explain the system.

---

## 1. System Map

| Layer | File | Constant / line |
|---|---|---|
| OT threshold (3h) | `src/lib/utils.ts` | `OVERTIME_THRESHOLD_SECONDS = 10800` — L20 |
| OT block helper (re-prompt every 1h) | `src/components/clock-widget.tsx` | `OVERTIME_REPROMPT_SECONDS = 3600` — L10 |
| Client response window (5m) | `src/components/clock-widget.tsx` | `OVERTIME_RESPONSE_WINDOW_SECONDS = 5 * 60` — L11 |
| OT detect + countdown timer | `src/components/clock-widget.tsx` | L217–248 |
| Blocking modal (with 3-tone audio alert) | `src/components/overtime-guardrail-dialog.tsx` | full file |
| Persistent OT banner after consent | `src/components/overtime-status-banner.tsx` | full file |
| Consent endpoint (sets 1h grace) | `src/app/api/presence/overtime-consent/route.ts` | `CONSENT_EXTENSION_MS = 60*60*1000` — L9 |
| Server cron (fallback enforcer) | `src/app/api/cron/auto-clock-out/route.ts` | `RESPONSE_WINDOW_SECONDS = 5*60` — L11; skip rules L77/L82/L87 |
| Admin force-out (sidebar) | `src/components/who-is-in-panel.tsx` | L131–145 |
| Admin force-out (attendance page) | `src/app/(app)/attendance/attendance-client.tsx` | L264–282 |
| Admin force-out endpoint | `src/app/api/admin/timesheets/force-clock-out/route.ts` | full file |
| Schema | `src/db/schema.ts` | timesheets table L23–35 |
| Consent column migration | `drizzle/0009_timesheet_overtime_consent.sql` | + `docs/migrations/add-overtime-consent.sql` |
| Tests | `src/__tests__/overtime.test.ts` | only covers `isOvertime` + `computeOvertime` utils |

**Flow (non-exempt user, 3h+ session, AFK at the modal):**

```
clock-in → +3h00m  → browser detects OT (15s poll) → modal opens, 5-min countdown starts, audio plays
              ↓ (no response in 5 minutes)
       +3h05m → browser setInterval(1s) hits remaining<=0 → POST /api/presence/clock-out
              ↓ (or, if browser is closed / laptop asleep / no client)
       +3h05m → /api/cron/auto-clock-out (Vercel daily + n8n every 1 min) closes the row
```

**Exempt users (admin / ceo):** `normalizeRole()` returns `"admin"`. The dialog still shows (no countdown), and the cron skips them entirely.

---

## 2. Environment + Schedule Setup

| Item | Where | Required value |
|---|---|---|
| `CRON_SECRET` env var | Vercel dashboard + `.env.local` | any random string — must be set, or cron returns 500 |
| `Authorization: Bearer ${CRON_SECRET}` header | Vercel cron config + n8n HTTP node | matches the env var |
| Vercel cron | `vercel.json` or dashboard | daily (Hobby plan ceiling) |
| n8n tight cadence | n8n workflow | GET `/api/cron/auto-clock-out` every 1 min |
| Timesheets columns | Supabase | `is_overtime`, `overtime_seconds`, `overtime_consent_until` (see `add-overtime-consent.sql`) |

---

## 3. Copy-Paste Audit Prompt

Paste the block below into a fresh Claude (or any LLM coding agent) session that has read access to the repo. Each item is a discrete, verifiable assertion — the agent should answer **PASS / FAIL / UNCLEAR** for each, with the exact line of evidence.

```text
You are auditing the overtime auto-clockout feature in the RS Ticketing System
(Next.js 16 + Supabase + Drizzle). The promise to the user is:

  After 3 hours clocked in, a blocking modal appears with a 5-minute countdown.
  If the user does not respond, the session is auto-closed at 3h 5min — by the
  browser if it's open, or by a server cron otherwise. Admin / CEO are exempt
  from auto-closure but still see the dialog.

Work through this checklist top to bottom. For each item, output one of:

  PASS  — assertion holds; quote the file:line of evidence
  FAIL  — assertion is violated; quote the file:line and explain the gap
  UNCLEAR — code does not clearly say either way; explain what you'd need to verify

Do not modify any source files. Read-only audit.

================================================================
SECTION A — CONSTANTS & SCHEMA
================================================================

A1. src/lib/utils.ts exports OVERTIME_THRESHOLD_SECONDS = 10800 (exactly 3 hours).

A2. src/components/clock-widget.tsx defines OVERTIME_RESPONSE_WINDOW_SECONDS = 5 * 60
    AND src/app/api/cron/auto-clock-out/route.ts defines RESPONSE_WINDOW_SECONDS = 5 * 60.
    BOTH constants are 300 seconds. If they ever diverge, the cron and the browser
    will disagree about when to close. Verify they are byte-for-byte equivalent.

A3. The timesheets table (src/db/schema.ts) has three OT-specific columns:
      is_overtime              (0/1 flag)
      overtime_seconds         (nullable, seconds past 3h)
      overtime_consent_until   (nullable, ISO string)
    Migration drizzle/0009_timesheet_overtime_consent.sql adds the third one.

A4. src/lib/utils.ts exports computeOvertime(elapsedSec) which returns
    { isOvertime, overtimeSeconds } and is used by BOTH the regular clock-out
    route (src/app/api/presence/clock-out/route.ts) AND the cron. Both writers
    populate is_overtime + overtime_seconds the same way. Verify no path
    forgets to write these columns.

================================================================
SECTION B — CLIENT TIMER (browser enforcement)
================================================================

B1. In src/components/clock-widget.tsx, the OT detect effect (around L217–231)
    runs setInterval(check, 15_000). Verify it only fires the modal when
    overtimeBlock(elapsedRef.current) > lastOvertimeBlockRef.current. The ref
    starts at -1 so the first crossing at exactly 10800s is block 0 and fires.

B2. The same effect sets overtimeDeadline to Date.now() + 5*60*1000 ONLY when
    isExempt is false. When isExempt is true, deadline is null and the
    countdown effect (L234–248) short-circuits. Verify exempt users see the
    modal but cannot be auto-closed by the browser timer.

B3. The countdown effect (L234–248) calls confirmClockOut() when
    Math.ceil((deadline - Date.now())/1000) <= 0. Verify:
      (a) it uses Date.now() each tick (not a counter), so a tab that was
          backgrounded / a laptop that slept will detect the breach on wake.
      (b) the setInterval is cleared on unmount and when overtimePromptVisible
          becomes false (return cleanup function).

B4. When the user clicks "Yes, continue working", consentOvertime() (L250–260):
      (a) advances lastOvertimeBlockRef.current to the current block (so the
          modal doesn't immediately re-fire).
      (b) clears overtimePromptVisible AND overtimeDeadline (so the countdown
          effect stops).
      (c) POSTs to /api/presence/overtime-consent (best-effort, fire-and-forget).

B5. When the user clicks "No, clock me out", the dialog calls onClockOut, which
    is wired to confirmClockOut. Verify that path POSTs /api/presence/clock-out
    and resets ALL overtime state (consented, promptVisible, deadline,
    lastOvertimeBlockRef back to -1). See L310–338.

B6. The OvertimeGuardrailDialog plays a 3-tone audio alert on mount (around
    L24–47 in overtime-guardrail-dialog.tsx). Verify the AudioContext is
    closed in the cleanup so it doesn't leak when the dialog unmounts.

================================================================
SECTION C — SERVER CRON (fallback enforcement)
================================================================

C1. /api/cron/auto-clock-out requires Authorization: Bearer ${CRON_SECRET}.
    If CRON_SECRET is unset the route returns 500. Verify there is NO fallback
    that lets the route run without the secret. (Production once shipped
    without this set — confirm the guard is intact.)

C2. The cron selects every row where clocked_out_at IS NULL. For each row, it
    skips when ANY of these is true:
      - elapsedSec < OVERTIME_THRESHOLD_SECONDS + RESPONSE_WINDOW_SECONDS  (< 3h5m)
      - normalizeRole(role) === 'admin'                                    (admin/ceo)
      - overtime_consent_until is set AND now < consent_until + 5min       (active consent)
    Verify the order is correct (cheap-skip-first is fine; just verify all
    three are present).

C3. Verify normalizeRole() in src/lib/rbac.ts maps "ceo", "admin", "owner",
    and any other role-strings the same way the client's isExempt prop is
    derived. If the layout passes isExempt for a role the cron does NOT
    skip (or vice versa), an exempt user will be auto-closed inconsistently.
    Cross-check: where is isExempt computed at the layout / page level, and
    does it use normalizeRole()? Quote both call sites.

C4. When the cron closes a session, it updates:
      clocked_out_at   = now ISO
      duration_seconds = elapsedSec
      is_overtime      = computeOvertime(elapsedSec).isOvertime ? 1 : 0
      overtime_seconds = isOvertime ? overtimeSeconds : null
    Then calls clockOut(userId) to broadcast SSE. Verify both steps fire
    even if the row update succeeds with 0 rows changed (i.e. nothing
    swallows a silent no-op).

C5. The cron is called by Vercel cron (daily on Hobby) AND n8n (every 1 min).
    Both invocations may overlap. Verify the route has NO assumption that
    only one instance is running. Specifically: two concurrent invocations
    will both see the same open row before either has updated it. Both
    will try to UPDATE; both will call clockOut(). This is at-least-once,
    not exactly-once. Is that acceptable, or does anything downstream
    (SSE subscribers, audit log, payroll) break on duplicate close events?

================================================================
SECTION D — ADMIN FORCE-OUT & EDGE CASES
================================================================

D1. The admin force-clock-out button appears in BOTH:
      src/components/who-is-in-panel.tsx (sidebar, L131–145)
      src/app/(app)/attendance/attendance-client.tsx (attendance table)
    Both POST to /api/admin/timesheets/force-clock-out. Verify the endpoint
    requires an admin role (not just an authenticated user), closes only the
    user's CURRENTLY OPEN session, and writes is_overtime/overtime_seconds
    using computeOvertime() — not a hard-coded 0/null.

D2. If the user is admin/ceo and works past 3h, the dialog SHOULD still appear
    (informational) but with autoClockOutInSeconds={null} and no countdown.
    Verify clock-widget.tsx L363 passes `isExempt ? null : overtimeRemaining`
    and the dialog L61 only renders the countdown bar when the prop is non-null.

D3. Consent extends the cron grace by 1 hour (CONSENT_EXTENSION_MS in
    overtime-consent/route.ts). Cron skip condition is
    `now < consent_until + 5*60*1000`. That means a consented session has
    65 minutes of cron-immunity, NOT 60. Confirm this is intentional (the
    extra 5 min matches the response window so the cron does not race the
    next hourly browser re-prompt). If a user consents at 3h, the next
    browser prompt fires at 4h. They have until 4h05m to respond. The cron
    becomes eligible at 4h05m. Verify the math.

D4. After consent expires and the user has not re-consented, the modal
    re-fires automatically — because overtimeBlock(elapsed) increments
    every OVERTIME_REPROMPT_SECONDS (3600s) and only fires when
    block > lastOvertimeBlockRef.current. Verify the browser re-prompt
    cadence (1h) and the cron post-consent eligibility (1h 5m) are aligned.

D5. Manual clock-out while the OT modal is visible: confirm clicking the
    sidebar / topbar "Clock Out" button still works (i.e. the modal does NOT
    intercept all clicks). Or, if it IS modal-blocking (recommended), the
    "No, clock me out" button in the dialog is the only way out.

D6. Race scenario: user clicks "Yes, continue" exactly as the 5-min countdown
    hits 0. confirmClockOut() may already be queued. Verify what wins:
      - if confirmClockOut() fires first, the session closes and the consent
        POST 404s harmlessly (no open session to update).
      - if consent POST fires first, the session has a consent_until set but
        the confirmClockOut() then closes it anyway, ignoring the consent.
    Document the actual behavior; both are defensible, just be honest about it.

D7. Tests. Confirm src/__tests__/overtime.test.ts exists and covers
    isOvertime() and computeOvertime() edge cases. Note whether ANY test
    exists for:
      - the cron route
      - the consent endpoint
      - the force-clock-out endpoint
      - the client countdown timer
    Missing tests are NOT a failure — just call them out as gaps.

================================================================
OUTPUT FORMAT
================================================================

Produce a markdown report with one row per checklist item:

| ID | Result | Evidence (file:line) | Notes |
|----|--------|----------------------|-------|
| A1 | PASS   | src/lib/utils.ts:20  | …     |
| …  | …      | …                    | …     |

End with a "Top 3 risks" summary if anything failed or is unclear.
```

---

## 4. Manual Smoke-Test Recipe (no waiting 3 hours)

These tests use SQL to **backdate** the clock-in so you can hit the OT boundary in seconds.

### Setup

1. Run `npm run dev` and log in as a non-admin test user (e.g. `ken` / `password123`).
2. Click **Clock In** in the sidebar.
3. Open Supabase → SQL Editor.

### Test 1 — Browser timer fires at 3h

```sql
-- Push the open session 2h 59m into the past — browser should pop the modal in ~60s.
update timesheets
set clocked_in_at = (now() - interval '2 hours 59 minutes')::text
where user_id = (select id from users where username = 'ken')
  and clocked_out_at is null;
```

✅ Within 60 seconds, the OT modal should appear with the 5:00 countdown and audio alert.

### Test 2 — Browser auto-closes at 3h 5m

Continue from Test 1. Don't click anything in the modal. After ~5 minutes, the session should close and the UI should flip to "Clocked Out". Verify in SQL:

```sql
select id, clocked_in_at, clocked_out_at, duration_seconds, is_overtime, overtime_seconds
from timesheets
where user_id = (select id from users where username = 'ken')
order by id desc limit 1;
```

✅ `clocked_out_at` is set, `is_overtime = 1`, `overtime_seconds ≈ 300`.

### Test 3 — Consent gives 1h grace + cron skips

Click **Clock In** again. Then:

```sql
update timesheets
set clocked_in_at = (now() - interval '2 hours 59 minutes')::text
where user_id = (select id from users where username = 'ken')
  and clocked_out_at is null;
```

Wait for the modal. Click **Yes, continue working**. Verify the consent column was set:

```sql
select overtime_consent_until from timesheets
where user_id = (select id from users where username = 'ken')
  and clocked_out_at is null;
```

✅ Should be ~1 hour from now.

Now manually hit the cron with the correct secret:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/auto-clock-out | jq
```

✅ Response should list your session in `skipped` with reason `"consent active"`.

### Test 4 — Cron closes an AFK session

Click **Clock In** again. Backdate by 3h 6m so the response window has already elapsed:

```sql
update timesheets
set clocked_in_at = (now() - interval '3 hours 6 minutes')::text
where user_id = (select id from users where username = 'ken')
  and clocked_out_at is null;
```

Close the browser tab (so the client timer can't fire). Hit the cron:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/auto-clock-out | jq
```

✅ Response should list your session in `closed` with `durationSeconds ≈ 11160`. Re-query timesheets to confirm `is_overtime = 1`, `overtime_seconds ≈ 360`.

### Test 5 — Admin exemption

Log in as the admin / CEO user. Backdate their clock-in by 3h 5m. Hit the cron:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/auto-clock-out | jq
```

✅ Their session should appear in `skipped` with reason `"admin/ceo exempt"`. The session must remain open.

---

## 5. Known Gaps & Follow-Ups

These are the audit-time concerns to keep an eye on. None are confirmed bugs — but each is somewhere a bug could be hiding.

1. **Two enforcers, no coordination.** Browser timer and cron can both fire on the same row. Row update is effectively idempotent (`clocked_out_at` becomes non-null after the first write), but SSE `clockOut(userId)` may broadcast twice. Verify no client UI gets confused by a duplicate "you have been clocked out" event.

2. **CRON_SECRET is load-bearing.** Empty / missing → cron 500s → nothing closes. Per memory, prod once shipped without it. Add a healthcheck or log alarm that catches a string of cron 500s.

3. **Exemption logic lives in two places.** The client-passed `isExempt` and the cron's `normalizeRole(...) === 'admin'` must always agree. If a new role string (e.g. `"founder"`) is added and only one side normalizes it, exempt status diverges.

4. **Consent grace = 65 min, not 60.** Cron immunity is `consent_until + 5min`. This is *probably* intentional — it lets the browser re-prompt at the 1h mark and the user gets the full 5-min response window before cron eligibility resumes. Worth documenting explicitly so it doesn't get "fixed" later.

5. **Background tab throttling.** Browsers throttle `setInterval` on hidden tabs. The countdown effect *should* still detect the breach on wake because `tick()` recomputes from `Date.now()`. Confirm by manually backgrounding the tab for 6 minutes and seeing what fires.

6. **Cron is at-least-once.** Vercel cron + n8n every 1 min may overlap with each other or with the browser's own clock-out request. The update is idempotent at the row level; SSE is not. Acceptable, but explicit.

7. **No automated tests** for the cron, the consent endpoint, or the force-clock-out endpoint. Only `src/__tests__/overtime.test.ts` covers `isOvertime` + `computeOvertime` utils. Manual smoke-test (section 4) is the current QA path.

8. **No structured logging** in the cron. Hard to debug a missed close after the fact. Consider adding a single line per closed/skipped session into a `cron_runs` table or a structured stdout log.
