-- ============================================================
-- RS Ticketing System — Supabase SQL Editor Setup
-- Last updated: 2026-05-13 (schema v6 — includes all migrations)
-- ============================================================
-- Paste this entire file into Supabase → SQL Editor → New query
-- and click RUN. Safe to run on an existing database — every
-- statement uses IF NOT EXISTS / DO $$ guards.
-- ============================================================


-- ── SECTION 1: TABLES ────────────────────────────────────────
-- Creates all four app tables with the complete, final schema.
-- IF NOT EXISTS means re-running is always safe.

CREATE TABLE IF NOT EXISTS public.users (
  id                        SERIAL PRIMARY KEY,
  username                  TEXT    NOT NULL UNIQUE,
  password_hash             TEXT    NOT NULL DEFAULT '',
  name                      TEXT    NOT NULL,
  email                     TEXT    NOT NULL UNIQUE,
  role                      TEXT    NOT NULL DEFAULT 'ic',
  team                      TEXT,
  job_title                 TEXT,
  plane_member_id           TEXT,
  is_active                 INTEGER NOT NULL DEFAULT 1,
  reminder_enabled          INTEGER NOT NULL DEFAULT 1,
  reminder_interval_minutes INTEGER NOT NULL DEFAULT 120,
  created_at                TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.timesheets (
  id               SERIAL  PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  clocked_in_at    TEXT    NOT NULL,
  clocked_out_at   TEXT,
  duration_seconds INTEGER,
  notes            TEXT,
  date             TEXT    NOT NULL,
  created_at       TEXT    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.weekly_reports (
  id                 SERIAL  PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  week_start         TEXT    NOT NULL,
  client_engagements TEXT,
  risks              TEXT,
  meetings           TEXT,
  ideas              TEXT,
  submitted_at       TEXT,
  updated_at         TEXT    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.attendance (
  id               SERIAL  PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  week_start       TEXT    NOT NULL,
  monday_status    TEXT,
  tuesday_status   TEXT,
  wednesday_status TEXT,
  thursday_status  TEXT,
  friday_status    TEXT,
  saturday_status  TEXT,
  sunday_status    TEXT,
  notes            TEXT,
  submitted_at     TEXT,
  created_at       TEXT    DEFAULT CURRENT_TIMESTAMP
);


-- ── SECTION 1b: COLUMN BACKFILL ──────────────────────────────
-- These ADD COLUMN IF NOT EXISTS statements are no-ops when the
-- column already exists. Run against an existing Supabase project
-- to bring its schema up to the latest version without recreating
-- any tables or losing data.

-- timesheets: notes column (migration 0003)
ALTER TABLE public.timesheets
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- attendance: weekend columns (migration 0004)
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS saturday_status TEXT;

ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS sunday_status TEXT;

-- users: clock-out reminder prefs (migration 0005)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS reminder_enabled INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS reminder_interval_minutes INTEGER NOT NULL DEFAULT 120;

-- weekly_reports: meetings column
ALTER TABLE public.weekly_reports
  ADD COLUMN IF NOT EXISTS meetings TEXT;


-- ── SECTION 2: INDEXES ───────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_users_email
  ON public.users (email);

CREATE INDEX IF NOT EXISTS idx_users_role
  ON public.users (role);

CREATE INDEX IF NOT EXISTS idx_timesheets_user_id
  ON public.timesheets (user_id);

CREATE INDEX IF NOT EXISTS idx_timesheets_date
  ON public.timesheets (date);

CREATE INDEX IF NOT EXISTS idx_timesheets_open
  ON public.timesheets (user_id, clocked_out_at)
  WHERE clocked_out_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_weekly_reports_user_week
  ON public.weekly_reports (user_id, week_start);

CREATE INDEX IF NOT EXISTS idx_attendance_user_week
  ON public.attendance (user_id, week_start);


-- ── SECTION 3: ROW LEVEL SECURITY (RLS) ──────────────────────
-- The Next.js server uses the service role key (createAdminClient)
-- which bypasses RLS entirely — all server queries are unaffected.
-- RLS only applies when the anon/authenticated key is used (e.g.
-- Supabase Realtime subscriptions from the browser).
--
-- Policy: any authenticated user can SELECT all rows.
-- All INSERT / UPDATE / DELETE come from the server (service role).

ALTER TABLE public.users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance     ENABLE ROW LEVEL SECURITY;

-- Drop first so this script is fully re-runnable without errors
DROP POLICY IF EXISTS "rs_authenticated_read_users"          ON public.users;
DROP POLICY IF EXISTS "rs_authenticated_read_timesheets"     ON public.timesheets;
DROP POLICY IF EXISTS "rs_authenticated_read_weekly_reports" ON public.weekly_reports;
DROP POLICY IF EXISTS "rs_authenticated_read_attendance"     ON public.attendance;

CREATE POLICY "rs_authenticated_read_users"
  ON public.users FOR SELECT TO authenticated USING (true);

CREATE POLICY "rs_authenticated_read_timesheets"
  ON public.timesheets FOR SELECT TO authenticated USING (true);

CREATE POLICY "rs_authenticated_read_weekly_reports"
  ON public.weekly_reports FOR SELECT TO authenticated USING (true);

CREATE POLICY "rs_authenticated_read_attendance"
  ON public.attendance FOR SELECT TO authenticated USING (true);


-- ── SECTION 4: REALTIME ──────────────────────────────────────
-- Adds public.users to supabase_realtime so the admin User
-- Management page receives live events when someone onboards.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'users'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
  END IF;
END $$;


-- ── SECTION 5: GOOGLE OAUTH SETUP CHECKLIST ──────────────────
-- These are dashboard steps — there is no SQL for them.
-- Complete them in Supabase → Authentication settings.
--
--  1. Authentication → Providers → Google
--     • Enable Google provider
--     • Paste your Google OAuth Client ID
--     • Paste your Google OAuth Client Secret
--     • Authorized redirect URI to add in Google Cloud Console:
--       https://<your-project-ref>.supabase.co/auth/v1/callback
--
--  2. Authentication → URL Configuration
--     • Site URL:            https://your-app-domain.com
--     • Redirect URL (add):  https://your-app-domain.com/auth/callback
--     • Redirect URL (add):  http://localhost:3000/auth/callback  (for local dev)
--
--  3. Authentication → Email Templates (optional)
--     • Customize the confirm signup email if you enable email auth


-- ── SECTION 6: ENVIRONMENT VARIABLES ─────────────────────────
-- Required in .env (Next.js project root):
--
--   NEXT_PUBLIC_SUPABASE_URL        = https://<project-ref>.supabase.co
--   NEXT_PUBLIC_SUPABASE_ANON_KEY   = eyJ...  (from API → Project API keys)
--   SUPABASE_SERVICE_ROLE_KEY       = eyJ...  (from API → Project API keys)
--   ORG_CHART_API_KEY               = <key from org chart settings>
--   JWT_SECRET                      = <any long random string>
--   DATABASE_URL                    = postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres
--
-- For DATABASE_URL use Transaction mode (port 6543) if behind pgBouncer,
-- or Session mode (port 5432) for Drizzle migrations.


-- ── SECTION 7: VERIFY ────────────────────────────────────────

-- All four tables present
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('users', 'timesheets', 'weekly_reports', 'attendance')
ORDER BY table_name;

-- Full column list for each table
SELECT table_name, column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('users', 'timesheets', 'weekly_reports', 'attendance')
ORDER BY table_name, ordinal_position;

-- RLS enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('users', 'timesheets', 'weekly_reports', 'attendance')
ORDER BY tablename;

-- Policies exist
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Realtime publication
SELECT pubname, schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'users';


-- ── DONE ─────────────────────────────────────────────────────
--
--  Tables       public.users, timesheets, weekly_reports, attendance
--               (complete schema — all 6 migrations included)
--
--  users        id, username, password_hash, name, email, role,
--               team, job_title, plane_member_id, is_active,
--               reminder_enabled, reminder_interval_minutes,
--               created_at, updated_at
--
--  timesheets   id, user_id, clocked_in_at, clocked_out_at,
--               duration_seconds, notes, date, created_at
--
--  weekly_reports  id, user_id, week_start, client_engagements,
--                  risks, meetings, ideas, submitted_at, updated_at
--
--  attendance   id, user_id, week_start, monday_status … sunday_status,
--               notes, submitted_at, created_at
--
--  Indexes      email, role, user_id, date, open sessions, week lookups
--  RLS          ON — authenticated SELECT; service role bypasses for writes
--  Realtime     public.users → live onboarding events in admin view
-- ============================================================
