-- Custom board columns: projects can add their own states alongside the six
-- defaults seeded by createProject(). `is_default` marks the seeded columns so
-- they can't be deleted (Done / Cancelled drive auto-archive and board filtering).
--
-- Every state that exists before this migration is a default — there was no way
-- to add custom ones. The backfill only runs when the column is first added, so
-- re-applying is safe and never re-flags custom columns.
--
-- Hand-authored + idempotent. Apply with:
--   npx tsx --env-file=.env scripts/apply-migration.ts drizzle/0012_project_state_is_default.sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_states' AND column_name = 'is_default'
  ) THEN
    ALTER TABLE project_states ADD COLUMN is_default boolean NOT NULL DEFAULT false;
    UPDATE project_states SET is_default = true;
  END IF;
END $$;
