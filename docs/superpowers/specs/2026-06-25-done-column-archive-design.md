# Design: Taming the Done column — archive, auto-archive & restore

**Date:** 2026-06-25
**Status:** Approved — implementing

## Problem

Completed tasks accumulate in the Done (`completed` group) column of a project
board indefinitely. Today the only cleanup path is archiving **one task at a
time** from inside its task-detail sheet (`caps.canArchiveItem`, leads/admins),
and once `work_items.archived = 1` the task disappears from every board and list
with **no UI to view or restore it**. So the board grows unbounded and archiving
feels like an irreversible delete.

A second, related issue surfaced during review: on large monitors (e.g. 27")
the authenticated pages do **not** use the full width — a content-width
constraint in the shared app layout centers everything with large side margins.

## Goals

1. Let leads clear the Done column quickly (bulk) **and** automatically (time-based).
2. Make archiving **safe and reversible** — a per-project Archive view with Restore.
3. Keep the board from being an endless scroll even before anyone archives.
4. Let authenticated pages fill wide screens (remove the global content-width cap).

## Non-goals

- Project-level archiving (already exists: `archiveProject`, `canArchiveProject`).
- Changing cancelled-task handling (cancelled group is already excluded from the board).
- Reworking the per-task archive button in the task sheet (kept as-is; it gains Restore parity via the new Archive view).

## Decisions (locked)

- **Mechanism:** both — automatic time-based auto-archive **and** a manual bulk button.
- **Restore:** yes — a per-project Archive view that browses and restores archived tasks.
- **Default auto-archive window:** 30 days (Linear-style), per-project configurable, with an Off option.
- **Archive view surface:** a drawer/sheet opened from the board header (not a separate route).
- **Done display cap:** the Done column shows the newest N (default 50) completed cards with a "+ X more in Archive" footer link; older completed cards are reachable via the Archive view.

## Data model (additive)

| Change | Location | Notes |
|---|---|---|
| `work_items.archived_at` — nullable timestamp | `src/db/schema.ts` | set on archive, cleared on restore; sorts the Archive view |
| `projects.auto_archive_done_days` — integer, nullable, default 30 | `src/db/schema.ts` | `null`/`0` = off |
| `restored` activity action | activity log convention | logged on restore |

Both columns are added to `schema.ts` and a Drizzle migration generated
(`npx drizzle-kit generate`). All reads/writes are best-effort: if a column is
not yet migrated, the code degrades gracefully (existing pattern in
`lib/notifications.ts`).

## Components & data flow

### 1. Manual bulk archive — "Archive completed"
- **UI:** a `⋯` menu on the Done column header → "Archive completed (N)", visible only when `caps.canArchiveItem`.
- **Confirm:** "Archive all N completed tasks? They move to the project Archive — you can restore them anytime."
- **Endpoint:** `POST /api/tickets/projects/[projectId]/archive-completed` → `bulkArchiveCompleted(projectId)` archives every non-archived work item whose state is in the `completed` group; returns `{ count }`. Logs `archived` per item (actor = caller).
- **Board:** removes the archived cards from the Done column optimistically.

### 2. Auto-archive — daily cron
- **Setting:** `projects.auto_archive_done_days` (Project Settings control, leads/admins).
- **Cron:** `GET /api/cron/archive-done`, gated by `CRON_SECRET` (same pattern as `auto-clock-out` / `task-due-reminders`). Added to `vercel.json` crons at `0 2 * * *`.
- **Logic:** for each project with `auto_archive_done_days > 0`, archive completed-group work items whose `completed_at` is older than the window. Sets `archived = 1`, `archived_at = now`. Idempotent. Logs `archived` (actor = null/system).

### 3. Archive view + Restore
- **UI:** an "Archive (N)" button in the board header opens a drawer listing archived tasks (name, `#seq`, archived-by, archived-at), each with **Restore** and click-to-open.
- **Reads:** `getArchivedWorkItems(projectId)` (archived = 1, newest `archived_at` first).
- **Restore:** `POST /api/tickets/work-items/[id]/restore` → `restoreWorkItem(id)` sets `archived = 0`, `archived_at = null`; task reappears in its state column. Logs `restored`. Gated to `canArchiveItem`.
- **Visibility:** viewing the Archive is open to anyone who `canView`; Restore is leads/admins only.

### 4. Done display cap
- The board caps the rendered completed cards (newest `DONE_VISIBLE_CAP = 50`) and renders a footer "+ X more in Archive →" that opens the Archive drawer. Purely a display concern in `kanban-board.tsx`; does not change data.

## Layout width fix

- Remove/raise the **single primary content-width constraint** in the shared
  authenticated layout (`src/app/(app)/layout.tsx`) so content fills available
  width on large screens, keeping sensible horizontal padding.
- Page-level wrappers that re-impose a narrow cap are widened to match.
- **Leave intentional local `max-w-*`** alone: modals, narrow forms, prose/reading
  columns, the task-detail sheet's own width logic. (Exact inventory comes from
  the width-constraint audit; only page-level wrappers change.)

## Permissions

| Action | Who |
|---|---|
| Configure auto-archive window | leads + admins (`canManage`) |
| Bulk "Archive completed" | leads + admins (`canArchiveItem`) |
| Restore a task | leads + admins (`canArchiveItem`) |
| View the Archive drawer | anyone who `canView` the project |

## Error handling

- Missing migrated columns → no-op / empty rather than throwing (best-effort pattern).
- Cron is idempotent and `CRON_SECRET`-gated; returns 500 if the secret is unset (matches existing crons).
- Bulk archive and restore return explicit counts/results; board updates are optimistic with revert on failure.

## Testing (vitest)

- **auto-archive policy:** an item qualifies iff its state is in the `completed` group **and** `completed_at` is older than the window; non-completed or recent items do not.
- **bulk archive:** returns the correct count and only touches completed, non-archived items.
- **restore round-trip:** archived → restored returns the item to its prior state column (archived flag cleared).

## UI execution

Visual design of the column `⋯` menu, the Archive drawer, and the settings
control is executed with the **ui-ux-pro-max** skill during implementation,
using the `--rs-` token system and Base UI (render-prop, not Radix `asChild`).
