-- =====================================================================
-- enable-rls-work-item-links.sql                         2026-09-25
-- Same "RLS Disabled in Public" fix as enable-rls-project-comments.sql,
-- for the new work_item_links table (drizzle/0011_work_item_links.sql).
-- Postgres defaults new tables to RLS-disabled, which would leave it
-- world-readable/writable via the anon key.
--
-- Safe: the app reads/writes this table through the service-role admin
-- client, which bypasses RLS. No policies needed — anon/authenticated
-- simply lose PostgREST access to this table.
--
-- REVERSIBLE: ALTER TABLE public.work_item_links DISABLE ROW LEVEL SECURITY;
-- =====================================================================

ALTER TABLE public.work_item_links ENABLE ROW LEVEL SECURITY;

-- VERIFY (should return 1 row with rowsecurity = true):
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' AND tablename = 'work_item_links';
