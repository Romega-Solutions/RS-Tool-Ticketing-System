# 3-Hour Overtime Guardrail — Design

Date: 2026-05-19

## Summary

Add a non-optional overtime guardrail that triggers when a user's continuous
clock-in session reaches 3 hours. The user is hard-prompted (blocking modal +
sound) to either stop (auto clock-out) or consent to overtime. While in
consented overtime, an app-wide status card is shown and the overtime state is
reflected consistently across every clock/presence surface. Overtime is
recorded on the timesheet row at clock-out. This runs alongside the existing
configurable soft clock-out reminder (both kept).

## Single source of truth

One set of helpers in `src/lib/utils.ts` (next to `formatDuration`), used by
every surface so the rule is defined exactly once:

- `OVERTIME_THRESHOLD_SECONDS = 10800` (3h)
- `isOvertime(elapsedSeconds: number): boolean` — for live UI surfaces
- `computeOvertime(durationSeconds: number): { isOvertime: boolean; overtimeSeconds: number }`
  — for the DB write (`overtimeSeconds = max(0, duration - 10800)`)

## 1. Guardrail flow

- Clock widget already tracks continuous-session elapsed seconds.
- At `elapsed >= 10800`: a **blocking modal** (full-screen overlay, no
  click-away dismiss) + an **urgent alert sound** appears.
  - Copy: "You've been clocked in for 3 hours. Do you want to continue into
    overtime?"
  - **"No, clock me out"** → calls the existing clock-out flow immediately,
    ends the session.
  - **"Yes, continue"** → modal closes, client enters consented-overtime state.
- **Hourly re-prompt**: at 4h, 5h, 6h… (every additional 3600s past threshold)
  the same blocking modal + sound fires again. No = auto clock-out, Yes =
  continue.
- All overtime state resets on clock-out (manual or auto).
- The existing soft interval reminder is unchanged and still runs (both
  mechanisms active, per decision).

## 2. Overtime reflected across all clock/presence UI

All live presence surfaces already compute elapsed seconds client-side from
`clockedInAt`, so they only need to call `isOvertime(elapsed)` — no API
changes for them.

| Surface | File | Change |
|---|---|---|
| App-wide floating card | new `src/components/overtime-status-banner.tsx` | Persistent amber/red card with live OT counter + "Clock out now"; rendered while in consented-overtime, covers every page |
| Clock widget — topbar pill | `src/components/clock-widget.tsx` | Green "Clocked in · 2h" pill becomes amber "Overtime · 3h12m" past threshold |
| Clock widget — sidebar | `src/components/clock-widget.tsx` | Same amber treatment on the sidebar "Clocked in" line |
| "Who's In" topbar panel | `src/components/who-is-in-panel.tsx` | Person past 3h shows amber dot + "OT" badge instead of green |
| Dashboard "Who's In" card | `src/components/presence-panel.tsx` | Same amber/OT badge per person |
| Live page | `src/app/(app)/live/page.tsx` | Same amber/OT badge per person |
| Weekly attendance grid | `src/app/(app)/attendance/attendance-client.tsx` | Sessions/days with `is_overtime` get an OT marker on the duration |
| Admin timesheets | `src/app/api/admin/timesheets/route.ts` + its UI | Route also selects `is_overtime` / `overtime_seconds`; UI surfaces OT |

## 3. Timesheet recording

New columns on `timesheets`:

| Column | Type | Meaning |
|---|---|---|
| `is_overtime` | integer (0/1), default 0 | Session crossed 3h |
| `overtime_seconds` | integer, nullable | `duration_seconds - 10800`, floored at 0 |

Computed **server-side** in `src/app/api/presence/clock-out/route.ts` via
`computeOvertime(durationSeconds)` from the real clock-in/out timestamps — not
trusted from the client. New migration `drizzle/0006_timesheet_overtime.sql`,
applied manually via the Supabase SQL Editor (same pattern as
`0005_user_reminder_prefs.sql`). `src/db/schema.ts` updated to add the columns.

## 4. Implementation surface

Guardrail logic, the blocking modal, and the floating card fold into / hang
off `clock-widget.tsx` — it owns elapsed tracking and is mounted once in the
shared `(app)/layout.tsx`, so a fixed overlay reaches every page. The blocking
dialog uses a more urgent variant of the existing Web Audio chime in
`clock-out-reminder-banner.tsx` (extract a small sound helper or add a new
one). Pure helpers (`isOvertime`, `computeOvertime`) get unit tests in
`src/__tests__`.

Reload mid-overtime: consent is not persisted server-side (YAGNI). If elapsed
is already past a threshold on mount, the blocking prompt fires immediately to
re-confirm — safe, since it re-prompts hourly anyway.

## 5. Out of scope

- Report `.xlsx` / export generation is not changed now (data is captured for
  later use).
- No admin-configurable threshold.
- No per-user opt-out (fixed 3h, applies to all users).
