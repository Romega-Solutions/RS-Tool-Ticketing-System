# Romega Portal — Features Batch (Design Spec)

**Date:** 2026-06-30
**Author:** Ken + Claude (brainstormed)
**Status:** Awaiting review → then implementation plan
**Areas:** User Management · Projects/PM · Notifications

> This is the *design* spec. Once approved, it becomes a step-by-step implementation
> plan. Nothing here is built yet. Grounded in a read of the current code (file:line
> references throughout).

---

## 0. Decisions already locked (from brainstorming)

| # | Question | Decision |
|---|----------|----------|
| 1 | How to edit a user after removing inline columns | **Editable profile dialog** — click user → profile dialog → edit in place → Save/Cancel |
| 2 | Task comment editor | **Tiptap + @mention + emoji** (same engine as Recruiting JD; mentions still fire notifications) |
| 3 | Notification email delivery | **Email + per-user toggle** (granular, default all ON) |
| 4 | CEO → Founder | **Add "Founder" as a selectable role** (stored `founder`, = Admin access); existing `ceo` rows display as Founder |

---

## 1. Surprises from the code read (changes the work)

These were verified, not assumed:

1. **Project Summary already excludes archived tasks.** `getWorkItems()` filters `archived: 0`
   (`src/lib/tickets.ts:182`), and the list-page counts use it (`src/app/(app)/projects/page.tsx:38–52`).
   → Item B7 is **mostly already done**; we only *verify* the in-project header counts.
2. **Copy-paste bug root cause found.** `src/app/globals.css:95–109` sets `user-select: none`
   on `body` and `*` (copy-protection), and the override only whitelists `input, textarea,
   select, [contenteditable], [role=textbox]`. Comment bodies are plain `<p>` (`task-detail-sheet.tsx:950`)
   so they inherit `none`. → **One-line CSS fix.**
3. **Project archiving backend is already built.** `archiveProject()` (`tickets.ts:1193`),
   `DELETE /api/tickets/projects/[projectId]`, and `canArchiveProject()` (leads+admins,
   `permissions.ts:117`). `projects.archived` column exists (`schema.ts:266`). → Only the
   **kebab UI** + an unarchive path + tabs are missing.
4. **Notifications are in-app only today.** The bell system already creates rows for
   mention / due-tomorrow / time-edit-requested / time-edit-decided / project-added — but
   **no email is ever sent** for any of them. → The notification work is *add email delivery*,
   not *build notifications from scratch*.
5. **`schema.ts` is drifted from the live DB** (per project memory: 7 tables unmodeled).
   → New columns are applied with `scripts/apply-migration.ts` (direct connection), **not**
   `drizzle-kit migrate` blindly. We still update `schema.ts` for types.

---

## A. User Management

### A1 — Edit a user from their profile dialog (not inline columns)

**Current:** `src/components/user-management-table.tsx` toggles each table *row* into input
cells (`startEdit`/`saveEdit`/`cancelEdit`, `editingId`, `editForm`; cells at lines 481–688).
Clicking a name opens a **read-only** profile dialog whose "Edit" button (≈900–924) *closes
the dialog* and drops back into inline-cell editing.

**Target:** The profile dialog *is* the editor.
- Click a user (name) → profile dialog opens.
- Dialog shows **Identity** (read-only: name, username, email, sourced from org chart) and
  **Editable** fields: role (select, now incl. Founder), team (select), member code,
  hourly rate, approved hours/week, schedule start/end, DOB, start date, end date, drive URL,
  active toggle.
- `[Cancel]` / `[Save]` in the dialog footer. Save → `PATCH /api/admin/users` (already
  supports every one of these fields — `route.ts:334–498`, no API change needed).
- **Remove** the inline-cell edit mode from table rows entirely; rows become read-only display.

**Files:** `user-management-table.tsx` (move `editForm` state + field inputs into the dialog;
delete per-cell `isEditing` branches). No API/schema change.

**Design (impeccable):**
- Dialog via the existing dialog/popover primitive (Base UI) — rendered in a portal so it
  escapes the table's overflow context. Semantic z-index (modal-backdrop → modal).
- Two-column field grid on wide, single-column on narrow; labels ≥4.5:1 contrast (not muted gray).
- Save = primary brand-blue button with a saving/disabled state; Cancel = ghost. Inline field
  validation (dates, https URL, rate ≥0) mirroring the API's rules so errors show before submit.
- Focus trap + `Esc` to cancel; `prefers-reduced-motion` → instant open, no scale-in.

**Effort:** Medium (refactor of one large component).

---

### A2 — Role display casing (`Intern`, `IC`, `Lead`, `Admin`, `Founder`)

**Current:** `roleLabel()` exists (`rbac.ts:188–193`) and is used in some places, but raw
lowercase role strings are rendered in: `user-management-table.tsx:493` (badge),
`:900` (profile dialog), `rates-client.tsx:230`. `live/page.tsx:44` shows `CEO` uppercase.

**Target:** A single display helper `roleDisplayLabel(rawRole)` in `rbac.ts`:
- normalizes the raw DB string, returns `Intern | IC | Lead | Admin | Founder`.
- **Founder preservation:** because `founder`/`ceo` normalize to `admin`, the helper special-cases
  raw `founder`/`ceo` → `"Founder"` *before* falling back to `roleLabel(normalizeRole(raw))`.
- Route all 4 display sites (and `live/page.tsx`) through it.

**Files:** `rbac.ts` (+helper), `user-management-table.tsx` (×2), `rates-client.tsx`, `live/page.tsx`.

**Effort:** Low.

---

### A3 — CEO → Founder (same access as Admin, selectable)

**Current:** `normalizeRole()` already maps `ceo → admin` (`rbac.ts:77`). `VALID_ROLES` in the
users API includes `ceo` but **not** `founder` (`route.ts:46–49`). The role dropdown
`ROLE_OPTIONS` is `['intern','ic','lead','admin']` — no CEO/Founder option at all.

**Target:**
- `normalizeRole()`: add `founder` to the admin-alias set (keep `ceo` for back-compat).
- `VALID_ROLES`: add `founder`.
- `ROLE_OPTIONS` dropdown: add **Founder** (value `founder`, label "Founder").
- Display: `founder`/`ceo` → "Founder" via A2's helper.
- Founder inherits Admin access automatically (via `normalizeRole`). Tool key `ceo` (the
  "Briefing" tool) stays internal/unchanged — it's unrelated to the role rename.

**Files:** `rbac.ts`, `api/admin/users/route.ts`, `user-management-table.tsx`.

**Effort:** Low.

---

## B. Projects / PM

### B4 — Rich text for task Description **and** Comments

**Current:**
- Description = plain `<textarea>` (`task-detail-sheet.tsx:643–673`).
- Comments = plain `{c.body}` render (`:950`) + `MentionTextarea` input (`:954–973`).
- A reusable Tiptap editor already exists: `recruiting/positions/job-description-editor.client.tsx`
  — `StarterKit + TextStyle + FontSize + Placeholder`, toolbar: **bold, italic, underline,
  strikethrough, bullet list, ordered list, font-size**; outputs sanitized HTML to a hidden
  input; rendered via `src/components/rich-text.tsx` (`.rs-richtext`).

**Target:** One shared editor, used in three places (JD + description + comments).
1. **Extract** `job-description-editor.client.tsx` into a generic
   `src/components/rich-text-editor.client.tsx` with props: `name/value`, `onChange`,
   `placeholder`, `enableMentions?`, `mentionUsers?`, `enableEmoji?`. Recruiting JD switches to it
   (behavior unchanged).
2. **Task description:** replace the textarea with `<RichTextEditor>`. Store HTML; render with
   `<RichText>`. Plain-text legacy descriptions still render fine (escaped) — backward compatible.
3. **Comments:** replace `MentionTextarea` with `<RichTextEditor enableMentions enableEmoji>`:
   - Add Tiptap **Mention** extension (`@tiptap/extension-mention`) wired to project members, so
     `@name` becomes a structured node carrying the user id — **mentions keep firing notifications.**
   - **Emoji** insertion: a popover button inserting unicode emoji (lightweight; portal-rendered
     to avoid clipping). No heavy emoji extension needed.
   - Comment bodies now render as `<RichText>` (`.rs-richtext`).

**Server-side details (important):**
- **Sanitize** description + comment HTML on write via the existing `lib/sanitize` (prevents XSS;
  JD already does this).
- **Mention extraction change:** the comment POST route currently finds `@mentions` by scanning
  plain text (`api/tickets/work-items/[id]/comments/route.ts`). With the Mention extension, mentions
  are HTML nodes (`data-id`), so update extraction to parse mention node ids from the HTML. This
  preserves `notifyMention()` behavior. ← **highest-risk change; test it.**
- Verify `Underline` is in the editor's extension list (JD toolbar has the button; confirm the
  extension is registered, since `StarterKit` doesn't include underline by default).

**Files:** new `rich-text-editor.client.tsx`; `task-detail-sheet.tsx`; comments API route;
`recruiting/positions/*` (swap to shared component); `package.json` (`@tiptap/extension-mention`).

**Effort:** **High** (largest item; touches storage format + mention plumbing).

---

### B5 — Comment copy-paste fix

**Current:** Global `user-select: none` on `body` + `*` (`globals.css:95–109`); override
whitelist doesn't include rendered content, so comments can't be selected/copied.

**Target:** Add the rendered-content selectors to the allow-list:
`.rs-richtext, .rs-richtext *, [data-selectable]` → `user-select: text`. Since B4 makes
comments render as `.rs-richtext`, this single addition fixes copy/paste for comments **and**
descriptions/JD. (Scope stays surgical — the rest of the copy-protection is untouched.)

**Files:** `globals.css`.
**Effort:** Trivial. (Independent of B4 — can ship alone, just add a comment-body class too.)

---

### B6 — Back button on Project Settings (top-right)

**Current:** `projects/[id]/settings/page.tsx:29–37` header is `<h1>` + `<p>`, no back affordance.

**Target:** A back button in the **top-right** of the settings header (per your note: top-right,
not bottom). `← Back to project` → `/projects/[id]`. Ghost/secondary style, arrow-left icon,
keyboard-focusable, right-aligned in a flex header.

**Files:** `projects/[id]/settings/page.tsx`.
**Effort:** Trivial.

---

### B7 — Project Summary excludes archived tasks

**Current:** Already correct on the list page (`getWorkItems` filters `archived:0`).

**Target:** **Verify only** — confirm the in-project board/detail header counts (and any
"Done/Open" summaries) also use the archived-excluding source. Fix only if a stray count uses
the unfiltered list.

**Files:** `projects/page.tsx` (verify), `projects/[id]/*` header (verify).
**Effort:** Trivial (verification).

---

### B8 — Project-level archiving via kebab (leads only)

**Current:** Backend ready (`archiveProject`, DELETE route, `canArchiveProject` = leads+admins).
No card-level UI. Cards render at `projects/page.tsx:106–148`.

**Target:**
- Add a **3-dot kebab** to each project card (top-right, appears on hover **and** keyboard focus
  for a11y). Menu item: **Archive** (→ confirm dialog → `DELETE /api/tickets/projects/[id]`).
  In the Archived tab the same menu offers **Restore**.
- **Visibility gated to leads/admins:** compute `canArchiveProject` for the current session on the
  server (`projects/page.tsx`) and pass a boolean to the card; non-leads see no kebab.
- Extract a small **`ProjectCard` client component** (or a `ProjectCardMenu` client island) since
  the kebab needs interactivity; the page stays a server component.
- **Unarchive path:** add `POST /api/tickets/projects/[id]/restore` (or extend the route) calling
  `updateProject(id, { archived: 0, archived_at: null })`.

**Design (impeccable):**
- Kebab menu via native popover/portal (cards live in a grid; an `absolute` dropdown would clip).
  Semantic z-index (dropdown tier).
- Reuse the existing **styled confirm dialog** (the one added in the attendance batch) — "Archive
  this project? It moves to the Archived tab." No raw `window.confirm`.
- Kebab is a real `<button aria-label="Project actions">`; menu items keyboard-navigable.

**Files:** `projects/page.tsx`, new `ProjectCard`/menu client component, restore API route,
`tickets.ts` (`archived_at` in archive/restore).
**Effort:** Medium.

---

### B9 — Three tabs: Active / Archived / Project Activity

**Current:** Only a "My team / All teams" toggle (`projects/page.tsx:71–84`). `getProjects()`
filters `archived:0` (`tickets.ts:~129`).

**Target:** A tab bar above the project grid:

| Tab | Content |
|-----|---------|
| **Active** | Today's list (archived = 0). The existing grid, just relabeled. |
| **Archived** | Projects with `archived = 1` (done/paused). Each card's kebab → **Restore**. |
| **Project Activity** | Digital footprint of **Created** + **Archived** project events (read-only feed). |

- **Archived data:** add `getProjects({ archived })` (or `getArchivedProjects()`).
- **Project Activity — derive, no new table (recommended):** add an `archived_at` timestamp column
  to `projects`. Then Activity = union of `created` (from `projects.created_at`) + `archived`
  (from `projects.archived_at`), sorted desc, rendered in the existing activity-feed style
  (mirror `task-detail-sheet` activity tab / `getDashboardProjectActivity`). This satisfies
  "Created Projects and Archived Projects only" without new write-hooks scattered around.
  - *Alternative considered:* a `project_activity` table + log on every create/archive/restore.
    More flexible (captures Restore/renames) but heavier. **Not chosen** unless you want restore/edit
    events in the footprint — the requirement explicitly says created + archived only.

**Design (impeccable):** semantic `tablist`, keyboard arrow-nav, clear active indicator (brand
underline), optional per-tab counts. Active is default. Team toggle moves under the Active tab.
`prefers-reduced-motion` respected on tab transitions.

**Files:** `projects/page.tsx` (tabs + data), `tickets.ts` (`getProjects` archived param,
`archived_at`), migration (`projects.archived_at`), Activity feed component.
**Effort:** Medium.

---

## C. Notifications

> Routing of the **from-address → info@romega-solutions.com** is done by **you in n8n**
> (the "OpenClaw - Send Email via Gmail" workflow controls the sender). The app side just needs
> to *send* the emails through that webhook; no from-address lives in app code today.

### C10 — Email delivery layer (the core new work)

**Current:** `createNotification()` (`lib/notifications.ts:28–51`) inserts an in-app row only.
A generic n8n email sender exists (`sendAccountSetupEmail`, webhook `openclaw-send-email`,
payload `{ to, subject, body }`, `n8n.ts:309–340`). Absolute URLs via `publicBaseUrl()`
(`lib/app-url.ts`, canonical-prod fallback). No notification ever emails.

**Target — make `createNotification()` the single choke point:**
1. Add a generic `sendEmail({ to, subject, html })` in `n8n.ts` (reuses the `openclaw-send-email`
   webhook). **Fire-and-forget** (don't block the request; catch+log like other n8n calls) so
   posting a comment isn't slowed by email latency.
2. In `createNotification()`, after the row insert: look up the recipient's email + **notification
   prefs**; if email is enabled for that event type, render an HTML template and call `sendEmail`.
3. Every existing caller (mention, due, time-edit decided, project-added) gets email **for free**
   once they pass email metadata.

**Email template:**
- **Task-related events** (mention, assignee-added, due-today): header + **Title, Description,
  Priority, Due Date** + a prominent **"Open in Romega Portal"** button →
  `publicBaseUrl() + notification.link` (deep-links to the exact task/comment).
- **Non-task events** (time-edit decided, project-added): adapted content — decision +
  approver comment, or project name — same button + deep link. ("Title/Description/Priority/Due"
  only fully applies to task events; others use sensible analogues.)
- HTML built in `lib/email-templates.ts` (where the account-setup template already lives).
- Design (impeccable): single-column email, brand header, ≥4.5:1 text, one clear CTA button,
  no gradient text, plain-text fallback in `body`.

**Files:** `lib/notifications.ts`, `lib/n8n.ts` (`sendEmail`), `lib/email-templates.ts`,
env note (`N8N_NOTIFICATION_EMAIL_URL` or reuse account-setup webhook).

---

### C11 — Coverage (the 5 events) + per-user toggle

**Status of each required event:**

| Event | In-app today | Email needed | Work |
|-------|:---:|:---:|------|
| Tagged in a comment (@mention) | ✅ | ✅ | pass task meta → email |
| Assignee + due date **within the day** | ⚠️ "due **tomorrow**" cron only | ✅ | switch/extend cron to **due-today**, email assignees |
| Time request approved/denied | ✅ | ✅ | email requester (incl. decision + comment) |
| Added to a Project | ✅ | ✅ | email new member |
| Added to a Task (as assignee) | ❌ **missing** | ✅ | **new** trigger + email |

- **Assignee-added (new):** hook `patchWorkItem()` (`tickets.ts:341–353`) — diff old vs new
  assignee list, and for each *newly added* assignee (excluding self) create a `task_assigned`
  notification → email. New helper `notifyTaskAssigned()`.
- **Due-today:** the cron `api/cron/task-due-reminders` currently targets *tomorrow*. Change it to
  fire for tasks **due today** for each assignee (requirement: "due date is within the day").
  (Keep dedupe-by-link so it doesn't spam on re-runs.)

**Per-user toggle (default all ON):**
- Add `users.notification_prefs` **jsonb**, default
  `{"email":true,"mentions":true,"dueToday":true,"approvals":true,"projectAdded":true,"taskAdded":true}`.
- A master `email` switch + per-event switches in the **profile page** "Notifications" section
  (which already hosts clock-out reminder prefs — `profile/page.tsx:318–363`). Self-service, no admin.
- `createNotification()` checks `prefs[eventKey] && prefs.email` before emailing. In-app bell is
  unaffected by the toggle (email-only opt-out).

**Files:** `schema.ts` (+`notification_prefs`), migration (apply via `scripts/apply-migration.ts`),
`profile/page.tsx` + `/api/profile/*`, `lib/notifications.ts`, `tickets.ts` (assignee diff),
`api/cron/task-due-reminders/route.ts`.
**Effort:** Medium-High.

---

## D. Database migrations (applied via `scripts/apply-migration.ts`, not blind drizzle)

> `schema.ts` is drifted from prod (memory). Update `schema.ts` for types, but apply DDL with the
> direct-connection `scripts/apply-migration.ts` pattern used in recent batches.

1. `ALTER TABLE projects ADD COLUMN archived_at text;` — for Project Activity (B9).
2. `ALTER TABLE users ADD COLUMN notification_prefs jsonb NOT NULL DEFAULT '{…all true…}';` — (C11).
3. New notification `type` value `'task_assigned'` — `type` is free-text (no enum/constraint),
   so no DDL; just a new string.

Add cases to the `supabase-write-columns.test.ts` guard (memory) so the new columns in write
payloads are validated against real columns.

---

## E. Build / ship order (suggested)

**Wave 1 — quick wins, independent, low risk**
- B5 copy-paste CSS · B6 settings back button · A2 role casing · A3 Founder role · B7 verify counts

**Wave 2 — projects structure**
- B8 project kebab archive (+restore API) · B9 three tabs (+`archived_at` migration)

**Wave 3 — user editing**
- A1 editable profile dialog

**Wave 4 — heaviest, do last**
- B4 shared rich-text editor (description + comments + mention + emoji)
- C10/C11 notification email layer (+`notification_prefs` migration, assignee trigger, due-today)

Waves 1–3 are largely parallelizable across agents; Wave 4's two tracks (rich-text vs email) are
independent of each other.

---

## F. Risks & watch-items

- **Mention re-plumbing (B4):** moving from plain-text `@` scan to Tiptap mention nodes is the
  riskiest change — a bug here silently breaks @mention notifications. Needs explicit tests.
- **Email volume / latency:** send fire-and-forget; never block comment/assignee writes on n8n.
- **HTML sanitization:** description + comments now store HTML → must sanitize server-side (reuse
  `lib/sanitize`) to prevent stored XSS.
- **Schema drift:** apply DDL with `scripts/apply-migration.ts`; don't run `drizzle-kit migrate`
  against prod blindly.
- **Copy-protection scope:** only content areas get `user-select: text`; don't disable it globally.

---

## G. Assumptions / open questions (defaults chosen — flag if wrong)

1. **Project Activity = derive from `created_at` + `archived_at`** (no `project_activity` table).
   Captures *created* + *archived* only, exactly as specified. Say so if you also want
   restore/rename events in the footprint.
2. **Emoji = lightweight unicode popover** (not a heavy emoji extension/asset pack).
3. **Due-today replaces due-tomorrow** in the reminder cron (your wording: "within the day").
   Tell me if you want *both* tomorrow + today reminders.
4. **Non-task emails** (time-edit decided, project-added) reuse the same email shell but with
   adapted fields, since they have no Priority/Due Date.
5. **"Leads only" archiving = leads + admins** (admins always bypass, per existing
   `canArchiveProject`). Founder = admin, so Founders can archive too.
