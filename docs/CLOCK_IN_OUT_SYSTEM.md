# Clock-In / Clock-Out + Live Presence System

**RS Ticketing System — Internal Feature Design**
*Last updated: 2026-05-06*

---

## Overview

A real-time clock-in/clock-out system embedded directly in the RS Ticketing System sidebar. Users manually clock in and out via a visible widget. Online presence is broadcast live to teammates via Server-Sent Events (SSE). All timesheet records are persisted in SQLite.

**No external services required.** Built entirely on the existing stack: Next.js 16 App Router, SQLite (better-sqlite3), JWT sessions, and native browser `EventSource` API.

---

## Feature Requirements

| Requirement | Detail |
|-------------|--------|
| Clock-in trigger | Manual button in sidebar — not automatic on login |
| Clock-out trigger | Manual button in sidebar OR automatic on logout |
| Real-time updates | Live broadcast via SSE — no polling |
| Timesheet persistence | Stored in SQLite `timesheets` table |
| Duration display | Live running timer while clocked in |
| Refresh resilience | Widget restores state from API on page refresh |

---

## RBAC Visibility Rules

| Role | Can see |
|------|---------|
| **IC** | Own clock-in/out widget + own timesheet history only |
| **Lead** | Own widget + presence/timelines of ICs on **same team** (not other leads) |
| **Admin / CEO** | Everyone's presence panel + full timesheet history |

Key constraints:
- IC → IC: cannot see each other's timelines
- Lead → Lead: cannot see other leads' timelines
- Only Admin/CEO role has cross-team and cross-role visibility

Team matching uses the `team` column in the `users` table.

---

## Architecture

```
Browser (IC/Lead/Admin)
   │
   ├─ ClockWidget (sidebar)
   │     ├─ POST /api/presence/clock-in   → records in SQLite + broadcasts SSE
   │     └─ POST /api/presence/clock-out  → updates duration in SQLite + broadcasts SSE
   │
   ├─ PresencePanel (dashboard, lead/admin only)
   │     └─ EventSource /api/presence/stream  → receives live clock events
   │
   └─ GET /api/presence  → initial snapshot on widget mount
```

### Real-Time Layer: Server-Sent Events (SSE)

SSE is one-directional: the server pushes JSON events to subscribed browser clients. The browser's built-in `EventSource` API handles reconnection automatically.

**Why SSE over WebSockets or Supabase:**
- Native in Next.js App Router Route Handlers — zero extra dependencies
- EventSource reconnects automatically on drop
- One-directional push is all we need (server notifies clients)
- No cost, no managed service, no data leaving the server

**Limitation:** In-memory presence map resets on server restart. Acceptable for a small internal tool — users re-clock-in after a restart just as they would a new workday.

### In-Memory Presence Store (`src/lib/presence.ts`)

A module-level singleton holds:
- `onlineUsers: Map<userId, PresenceUser>` — who's currently clocked in
- `subscribers: Map<userId, Subscriber>` — active SSE connections

When a clock-in/out event fires, the store broadcasts to each subscriber — but only sends events that the subscriber is allowed to see per RBAC rules.

---

## Database

### New Table: `timesheets`

```sql
CREATE TABLE timesheets (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL,
  clocked_in_at    TEXT NOT NULL,       -- ISO string (e.g. "2026-05-06T09:00:00.000Z")
  clocked_out_at   TEXT,                -- NULL while still clocked in
  duration_seconds INTEGER,             -- NULL until clocked out
  date             TEXT NOT NULL,       -- YYYY-MM-DD (local date)
  created_at       TEXT DEFAULT CURRENT_TIMESTAMP
);
```

One row per session. A user can clock in/out multiple times per day — each session is a separate row.

### Existing Tables Used

- `users` — `id`, `name`, `role`, `team`, `planeMemberId`
- `attendance` — unchanged (weekly status; separate from daily clock-in)

---

## API Routes

All routes under `/api/presence/`:

### `POST /api/presence/clock-in`
- Requires: authenticated session
- Checks for an existing open session (null `clocked_out_at`) — skips insert if found
- Inserts new row in `timesheets`
- Calls `presence.clockIn(...)` → broadcasts `clock_in` event to eligible SSE subscribers
- Returns: `{ timesheetId, clockedInAt }`

### `POST /api/presence/clock-out`
- Requires: authenticated session
- Finds the open timesheet row for the current user
- Updates: `clocked_out_at`, `duration_seconds = now - clockedInAt`
- Calls `presence.clockOut(userId)` → broadcasts `clock_out` event
- Returns: `{ durationSeconds, clockedOutAt }`

### `GET /api/presence`
- Requires: authenticated session
- Returns: current online snapshot (RBAC-filtered) + today's open session for self (if any)
- Used by `ClockWidget` on mount to restore state after page refresh

### `GET /api/presence/stream`
- Requires: authenticated session
- Opens an SSE stream
- Sends current snapshot as first event immediately
- Stays open, pushing `clock_in` / `clock_out` events as they happen
- Subscribes the connection to the in-memory store; cleans up on disconnect

---

## UI Components

### `ClockWidget` — `src/components/clock-widget.tsx`

Placed in the sidebar footer, above the Log Out button. Visible to all roles.

**State machine:**
```
loading → clocked_out → [Clock In clicked] → clocked_in → [Clock Out clicked] → clocked_out
```

**Visual:**
```
─────────────── Sidebar Footer ───────────────
  IC
  [Profile]

  ● Clocked in · 2h 34m
  [      Clock Out      ]

  [      Log Out        ]
──────────────────────────────────────────────
```

When clocked in: a `setInterval` runs every second to update the displayed duration in `h m` or `m s` format from the stored `clockedInAt` timestamp.

On page refresh: widget calls `GET /api/presence` to check if there's an open session and restores the timer from the original `clockedInAt`.

### `PresencePanel` — `src/components/presence-panel.tsx`

Shown on the dashboard page. Only rendered for `lead` and `admin` roles.

```
┌─────────────────────────────────────┐
│ Who's In Today             2 online │
├─────────────────────────────────────┤
│  KG  Ken Garcia      since  9:02 AM │
│  MS  Mark Siazon     since  9:18 AM │
└─────────────────────────────────────┘
```

- Subscribes to `EventSource('/api/presence/stream')` on mount
- `clock_in` event → adds user row to the list
- `clock_out` event → removes user row (or briefly shows "Clocked out")
- Unsubscribes (`eventSource.close()`) on component unmount

---

## Logout Integration

`src/app/api/auth/logout/route.ts` — before clearing the session cookie:
1. Looks up any open timesheet row for the current user
2. If found: updates `clocked_out_at` and `duration_seconds`, calls `presence.clockOut`
3. Then proceeds with clearing the cookie

This ensures no orphaned open sessions if a user logs out without manually clocking out.

---

## File Manifest

### New Files
```
src/lib/presence.ts                        In-memory store + SSE broadcaster
src/app/api/presence/route.ts              GET current snapshot
src/app/api/presence/stream/route.ts       SSE endpoint
src/app/api/presence/clock-in/route.ts     POST clock-in
src/app/api/presence/clock-out/route.ts    POST clock-out
src/components/clock-widget.tsx            Sidebar clock-in/out widget
src/components/presence-panel.tsx          Dashboard "Who's In" panel
docs/CLOCK_IN_OUT_SYSTEM.md                This file
```

### Modified Files
```
src/db/schema.ts                           Add timesheets table
src/components/app-sidebar.tsx             Add <ClockWidget /> in footer
src/app/(app)/dashboard/page.tsx           Add <PresencePanel /> for lead/admin
src/app/api/auth/logout/route.ts           Auto clock-out on logout
```

### Generated Files (auto, do not edit)
```
drizzle/0002_timesheets.sql                Migration — generated by drizzle-kit
drizzle/meta/0002_snapshot.json            Drizzle snapshot
```

---

## Verification Checklist

1. `npm run build` → 0 errors
2. Login as Ken (IC) → sidebar shows "Clock In" button
3. Ken clicks Clock In → button changes to "● Clocked in · 0m" with running timer
4. Open second tab as Mark (Lead, same team as Ken) → "Who's In" panel shows Ken
5. Ken clicks Clock Out → timer stops, Mark's panel removes Ken live
6. Login as Admin → sees all online users in presence panel
7. Ken logs out while clocked in → auto clock-out fires, timesheet closed
8. Ken logs back in → widget starts as clocked-out (no orphan session)
9. Ken refreshes page while clocked in → timer resumes from original clock-in time

---

## Future Enhancements

- Timesheet history page (`/attendance/history`) — show past days' sessions with total hours
- Export timesheets to Excel (similar to existing report generation)
- Admin-only view of all team members' timesheet history with totals
- Daily/weekly hour summary in the dashboard stats cards
