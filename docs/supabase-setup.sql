-- ============================================================
-- RS Ticketing System — Supabase SQL Editor Setup
-- ============================================================
-- Paste this entire file into Supabase → SQL Editor → New query
-- and click RUN. Safe to run on an existing database — every
-- statement uses IF NOT EXISTS / DO $$ guards.
-- ============================================================


-- ── SECTION 1: TABLES ────────────────────────────────────────
-- Creates all four app tables. If they already exist, this is
-- a no-op. Run any time you need to reset or verify schema.

CREATE TABLE IF NOT EXISTS public.users (
  id               SERIAL PRIMARY KEY,
  username         TEXT NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL DEFAULT '',
  name             TEXT NOT NULL,
  email            TEXT NOT NULL UNIQUE,
  role             TEXT NOT NULL DEFAULT 'ic',
  team             TEXT,
  job_title        TEXT,
  plane_member_id  TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.timesheets (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  clocked_in_at    TEXT NOT NULL,
  clocked_out_at   TEXT,
  duration_seconds INTEGER,
  date             TEXT NOT NULL,
  created_at       TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.weekly_reports (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  week_start          TEXT NOT NULL,
  client_engagements  TEXT,
  risks               TEXT,
  ideas               TEXT,
  submitted_at        TEXT,
  updated_at          TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.attendance (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  week_start       TEXT NOT NULL,
  monday_status    TEXT,
  tuesday_status   TEXT,
  wednesday_status TEXT,
  thursday_status  TEXT,
  friday_status    TEXT,
  notes            TEXT,
  submitted_at     TEXT,
  created_at       TEXT DEFAULT CURRENT_TIMESTAMP
);


-- ── SECTION 1b: COLUMN ADDITIONS ────────────────────────────
-- Safe to run on an existing database — ADD COLUMN IF NOT EXISTS is a no-op
-- when the column already exists.

ALTER TABLE public.weekly_reports ADD COLUMN IF NOT EXISTS meetings TEXT;


-- ── SECTION 2: INDEXES ───────────────────────────────────────
-- Performance indexes for the queries the app actually runs.

CREATE INDEX IF NOT EXISTS idx_users_email
  ON public.users (email);

CREATE INDEX IF NOT EXISTS idx_users_role
  ON public.users (role);

CREATE INDEX IF NOT EXISTS idx_timesheets_user_id
  ON public.timesheets (user_id);

CREATE INDEX IF NOT EXISTS idx_timesheets_date
  ON public.timesheets (date);

CREATE INDEX IF NOT EXISTS idx_weekly_reports_user_week
  ON public.weekly_reports (user_id, week_start);

CREATE INDEX IF NOT EXISTS idx_attendance_user_week
  ON public.attendance (user_id, week_start);


-- ── SECTION 3: ROW LEVEL SECURITY (RLS) ──────────────────────
-- Why RLS is needed:
--   The Next.js server uses DATABASE_URL (pgBouncer / postgres role)
--   which bypasses RLS entirely — all existing server queries are
--   unaffected. RLS only applies to browser clients using the
--   anon/authenticated key. Supabase Realtime uses those keys, so
--   RLS policies must exist for realtime events to be delivered.
--
-- Policy design: any authenticated session can SELECT all rows.
-- INSERT / UPDATE / DELETE always come from the server (service
-- role), so no write policies are needed here.

ALTER TABLE public.users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance     ENABLE ROW LEVEL SECURITY;

-- Drop first so this script is re-runnable without errors
DROP POLICY IF EXISTS "rs_authenticated_read_users"
  ON public.users;
DROP POLICY IF EXISTS "rs_authenticated_read_timesheets"
  ON public.timesheets;
DROP POLICY IF EXISTS "rs_authenticated_read_weekly_reports"
  ON public.weekly_reports;
DROP POLICY IF EXISTS "rs_authenticated_read_attendance"
  ON public.attendance;

CREATE POLICY "rs_authenticated_read_users"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "rs_authenticated_read_timesheets"
  ON public.timesheets
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "rs_authenticated_read_weekly_reports"
  ON public.weekly_reports
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "rs_authenticated_read_attendance"
  ON public.attendance
  FOR SELECT
  TO authenticated
  USING (true);


-- ── SECTION 4: REALTIME ──────────────────────────────────────
-- Adds public.users to the supabase_realtime publication so that
-- the admin User Management page receives live INSERT/UPDATE
-- events whenever a new user completes onboarding.
--
-- The DO $$ block checks first to avoid "already exists" errors
-- if you run this script more than once.

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


-- ── SECTION 5: VERIFY ────────────────────────────────────────
-- Run these SELECT statements after setup to confirm everything
-- is in place. You can paste just this section separately.

-- Check tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('users', 'timesheets', 'weekly_reports', 'attendance')
ORDER BY table_name;

-- Check RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('users', 'timesheets', 'weekly_reports', 'attendance')
ORDER BY tablename;

-- Check policies exist
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Check users table is in realtime publication
SELECT pubname, schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'users';


-- ── DONE ─────────────────────────────────────────────────────
-- After a successful run:
--
--  Tables       public.users, timesheets, weekly_reports, attendance
--  Indexes      email, role, user_id, date, week lookups
--  RLS          ON — authenticated users can SELECT; service role
--               (Drizzle) bypasses RLS for all writes
--  Realtime     public.users is in supabase_realtime publication
--               → Admin user list shows a live green banner
--                 whenever someone completes onboarding
-- ============================================================
