# Clock-Out Reminder — Feature Spec

## Summary

A client-side reminder system that notifies clocked-in users when they've been working for a configurable amount of time without clocking out. A dismissible banner card appears in the bottom-right corner and plays a soft audio chime. Users configure their preferences from the Profile page.

---

## Behavior

### Default
- Reminders fire at every multiple of the configured interval (default: 120 minutes).
- With the default 2-hour interval, reminders fire at: 2h, 4h, 6h, etc.
- After dismissing, the reminder re-fires only at the *next* threshold — not immediately.

### On page refresh
- If the user refreshes the page while clocked in past a threshold, the banner fires immediately on load.

### On clock-out
- The banner is hidden and the reminder counter resets.

### Reminders disabled
- No banner appears. No sound plays.

---

## User Preferences

Stored in the `users` table (Supabase Postgres):

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `reminder_enabled` | `INTEGER NOT NULL DEFAULT 1` | `1` (on) | Toggle: 1 = enabled, 0 = disabled |
| `reminder_interval_minutes` | `INTEGER NOT NULL DEFAULT 120` | `120` | Interval in minutes. Allowed: 30, 60, 120, 180 |

Preferences are editable in **Profile → Clock-Out Reminders**.

---

## UI

**Banner component** (`src/components/clock-out-reminder-banner.tsx`):
- Fixed position: bottom-right (`fixed bottom-4 right-4 z-40`)
- Amber accent border (`border-amber-200`)
- Header: Clock icon + "Still clocked in" title + elapsed time message
- Two buttons: **Dismiss** (neutral) and **Clock Out Now** (red, opens the clock-out confirmation dialog)
- Does NOT block the page — `z-40` stays below the confirmation overlay (`z-50`)

---

## Sound

Implemented with the Web Audio API (no external library):
- Tone 1: 880 Hz (A5), duration 0.4s
- Tone 2: 1108 Hz (C#6), starts at 0.18s offset, duration 0.5s
- Max gain: 0.18 (office-appropriate volume)
- Soft exponential fade-out on both tones
- Wrapped in `try/catch` — fails silently if AudioContext is blocked by browser policy

---

## Timer Logic

Located in `src/components/clock-widget.tsx`:
- Uses a `setInterval` polling every 30 seconds (not every second — no re-render cost)
- Reads `elapsedRef.current` (a ref synced with the live 1s timer) instead of depending on `elapsed` state
- Threshold calculation: `Math.floor(elapsedSeconds / intervalSeconds)` — fires whenever this value increments beyond what was last dismissed
- Dependencies: `[state, reminderEnabled, reminderIntervalMinutes]` — effect re-runs only on these changes

---

## Files Changed

| File | Change |
|------|--------|
| `drizzle/0005_user_reminder_prefs.sql` | Migration: 2 new columns on `users` |
| `src/db/schema.ts` | Add `reminderEnabled` + `reminderIntervalMinutes` to users table |
| `src/app/api/profile/me/route.ts` | GET returns + PUT accepts reminder prefs |
| `src/lib/utils.ts` | Export `formatDuration` (moved from clock-widget) |
| `src/components/clock-out-reminder-banner.tsx` | New banner component + Web Audio sound |
| `src/components/clock-widget.tsx` | Prefs fetch, reminder check effect, banner render |
| `src/app/(app)/profile/page.tsx` | Type + form state + Clock-Out Reminders section |
