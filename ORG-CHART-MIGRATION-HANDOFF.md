# Handoff: Make the Portal the Source of Truth for the Org Chart

Context handed off from a Claude Code session in `../RS_Tool-Org-Chart` (2026-10-06).
Delete this file once the migration is done.

## Decisions (already made — don't re-litigate)

1. **The portal DB (`public.users`, Supabase Postgres) is the single source of truth** for people, teams, and reporting lines.
2. **The Org Chart app becomes a read-only view.** It will read the portal DB directly (Drizzle + `postgres`, read-only DB role). No API sync, no editing in the chart.
3. **Reporting lines (primary + secondary leads) are edited ONLY in the portal's User Management.**
4. **Do NOT alter `public.users`.** New data goes in new tables keyed by `users.id`.
5. Schema changes go through **Drizzle migrations in this repo** (no hand-created tables).

## Current state (problems to fix)

### The portal currently depends on the Org Chart (must be reversed)
`src/lib/orgchart.ts` calls `https://tools.romega-solutions.com/org-chart/api/people` (`ORG_CHART_API_KEY`):
- **`src/app/auth/callback/route.ts`**
  - New users can only sign up if they exist (active, allowed email domain) in the Org Chart → otherwise `not_allowed`. Initial name/role/team/job_title come from the chart; role is derived from the chart title (`roleFromOrgTitle`).
  - Existing users: **`team` is overwritten from the Org Chart on every sign-in**, silently undoing admin edits in User Management.
- `syncUserTeamsFromOrgChart` + `POST /api/admin/sync-teams` — bulk-overwrite `users.team` from the chart.
- `getPhotoResolver` / `pickPhoto` — photos come from the chart.
- `lookupPerson`, `/api/orgchart/lookup` — used by onboarding, onboarders, attendance, profile.

PR #54 already made name/username/email/job_title admin-owned in the portal — good; team and sign-up gating still point at the chart.

### Migration tracking is broken
- Duplicate prefixes: `0007_user_approved_hours_schedule.sql` + `0007_wonderful_peter_quill.sql`, `0011_comment_audit_trail.sql` + `0011_work_item_links.sql`.
- `drizzle/meta/_journal.json` only lists up to `0007_wonderful_peter_quill`; `0007_user_approved_hours_schedule` and `0008`–`0012` are not in the journal (likely applied manually via `docs/migrations/*.sql`).
- Staging has `public.custom_teams` (id, name) and `public.impersonation_sessions` that are **not** in `src/db/schema.ts` or any migration. Expected to not be in prod yet, but they need migrations before prod.
- Open question: **what is `custom_teams` for?** No code references it. If it's meant to be the editable team list, the org chart departments should build on it instead of a separate table.

## Plan (do in order)

### Step 1 — Fix migration tracking
Reconcile `drizzle/` + `_journal.json` with what's actually applied on staging/prod; resolve duplicate numbering; add `custom_teams` / `impersonation_sessions` to `schema.ts` with migrations (confirm intent with the user first).

### Step 2 — Decouple sign-in from the Org Chart
- Remove the `team` overwrite for existing users in `auth/callback`.
- Replace sign-up gating. **User must choose the rule** (not decided yet). Options:
  - Admin pre-creates the user in User Management; sign-in only allowed for existing emails (simplest).
  - Allowed if an `onboarders` row with matching `romega_email` exists.
  - Email-domain allowlist + default role, admin assigns team afterwards.
- Remove `lookupOrgAuthProfileByEmail` / `roleFromOrgTitle` usage from auth.

### Step 3 — Add org chart tables (Drizzle migration)
Proposed (schema `org_chart`, adjust if `custom_teams` becomes the team list):
```sql
CREATE SCHEMA org_chart;

CREATE TABLE org_chart.departments (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  color text,
  display_order integer NOT NULL DEFAULT 0
);

CREATE TABLE org_chart.members (
  user_id integer PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  manager_id integer REFERENCES public.users(id) ON DELETE SET NULL,
  department_id integer REFERENCES org_chart.departments(id) ON DELETE SET NULL,
  title_override text,          -- null = use users.job_title
  photo_url text,
  employment_type text,
  display_order integer NOT NULL DEFAULT 0,
  is_hidden boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (manager_id IS NULL OR manager_id <> user_id)
);
CREATE INDEX ON org_chart.members (manager_id);

CREATE TABLE org_chart.secondary_managers (
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  manager_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, manager_id),
  CHECK (user_id <> manager_id)
);
```
Read-only role for the Org Chart app: `SELECT` on `org_chart.*` and only safe `users` columns (`id, name, email, job_title, team, is_active, end_date`) — never `password_hash`, `hourly_rate_usd`, `date_of_birth`, etc.

### Step 4 — User Management UI
Add to the user edit dialog: Reports to (single), Also reports to (multi), department, photo, chart display order, hide from chart.

### Step 5 — Replace Org Chart API calls with DB queries
Rewrite `fetchPeople` / `lookupPerson` / `getPhotoResolver` against `users` + `org_chart.*`; delete `syncUserTeamsFromOrgChart`, `/api/admin/sync-teams`, `ORG_CHART_API_KEY`.

### Step 6 — One-time backfill
From the Org Chart's SQLite (`orgchart.db`: `people.reports_to`, secondary leads stored as JSON in `people.project_ids` → `{"secondaryReportsTo":[ids]}`, departments, photos): match people → `users.id` **by email**, review unmatched manually, insert into `org_chart.*`. Fallback lead: `onboarders.direct_supervisor_id`.

### Step 7 — Org Chart repo (separate session in `../RS_Tool-Org-Chart`)
Switch to Postgres read-only, remove editing/SQLite/Google Sheet sync/n8n snapshot. Keep `/api/people` response shape until Step 5 ships, then retire it.

## Rules for the session
- Don't commit/push unless the user asks; branch off `main` first.
- Confirm before anything touching staging/prod databases.
