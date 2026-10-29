-- Rollback for drizzle/0020_candidates_active_application_uniq.sql.
-- Removes the index only; no data changes. Single statement: DROP INDEX
-- CONCURRENTLY cannot run inside a transaction block.
DROP INDEX CONCURRENTLY IF EXISTS public.candidates_active_application_uniq;
