-- One open application per (email, position title).
--
-- Partial unique index on lower(btrim(email)), lower(btrim(position)) for
-- candidates whose status is NOT closed. Closed statuses (keep in sync with
-- CLOSED_APPLICATION_STATUSES in src/lib/duplicate-application.ts):
--   failed, no_show, unresponsive, withdrew, hired, consider_other
-- Rows with a NULL email or position are not constrained (NULLs never clash).
-- The app checks the same rule before inserting; this index closes the race
-- between two simultaneous submissions (insert fails with SQLSTATE 23505,
-- mapped to ALREADY_APPLIED / "already exists" in the app).
--
-- CONCURRENTLY: no write lock on candidates while building, but it CANNOT run
-- inside a transaction block. This file is a single statement on purpose:
-- scripts/apply-migration.ts sends it as one simple query, which is not
-- wrapped in a transaction. Do NOT add other statements to this file, and do
-- not run it through a tool that wraps migrations in BEGIN/COMMIT.
--
-- Pre-check (must return 0 rows, otherwise the build fails on existing
-- duplicates that need to be closed or merged first):
--   docs/migrations/0020-candidates-active-application-precheck.sql
--
-- If the build fails part way, Postgres leaves an INVALID index behind.
-- Drop it with the rollback file, fix the data, and run this again.
--
-- Hand-authored. Idempotent (IF NOT EXISTS).
-- Undo:       docs/migrations/0020-candidates-active-application-uniq-rollback.sql
-- Apply with:
--   npx tsx --env-file=.env scripts/apply-migration.ts drizzle/0020_candidates_active_application_uniq.sql

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS candidates_active_application_uniq
  ON public.candidates (lower(btrim(email)), lower(btrim(position)))
  WHERE status NOT IN ('failed', 'no_show', 'unresponsive', 'withdrew', 'hired', 'consider_other');
