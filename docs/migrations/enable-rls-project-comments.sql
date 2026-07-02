-- =====================================================================
-- enable-rls-project-comments.sql                        2026-07-03
-- Closes the same "RLS Disabled in Public" hole the 2026-07-01 lockdown
-- (enable-rls-all-public-tables.sql) closed for every table that existed
-- at that time. Postgres defaults newly created tables to RLS-disabled,
-- so the new project_comments table (drizzle/0009_project_comments.sql)
-- would otherwise be world-readable/writable via the anon key.
--
-- Safe for the same reason as the original lockdown: this app writes
-- through the service-role admin client / DATABASE_URL owner role, both
-- of which bypass RLS. No policies needed — anon/authenticated simply
-- lose PostgREST access to this table.
--
-- REVERSIBLE: ALTER TABLE public.project_comments DISABLE ROW LEVEL SECURITY;
-- =====================================================================

ALTER TABLE public.project_comments ENABLE ROW LEVEL SECURITY;

-- VERIFY (should return 1 row with rowsecurity = true):
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' AND tablename = 'project_comments';
