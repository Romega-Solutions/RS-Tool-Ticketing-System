-- Allowed values for positions.employment_type:
--   'full_time' | 'part_time' | 'contractual' | 'internship'
-- (labels in src/lib/employment-types.ts). The column stays plain text with its
-- 'full_time' default; this only adds a CHECK so nothing else can be stored.
--
-- Added NOT VALID first (no long lock), then validated. Every existing row is
-- full_time or part_time, so validation passes and no data changes. If it
-- fails, find the offender with:
--   SELECT id, employment_type FROM positions
--   WHERE employment_type NOT IN ('full_time','part_time','contractual','internship');
--
-- Hand-authored. Idempotent: safe to run more than once.
-- Numbering: 0018 is used by the SOW end-date alerts branch (not merged yet).
-- Whichever of the two merges second must be checked/renumbered.
-- Undo:       docs/migrations/0019-positions-employment-type-check-rollback.sql
-- Apply with:
--   npx tsx --env-file=.env scripts/apply-migration.ts drizzle/0019_positions_employment_type_check.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'positions_employment_type_check') THEN
    ALTER TABLE public.positions
      ADD CONSTRAINT positions_employment_type_check
      CHECK (employment_type IN ('full_time', 'part_time', 'contractual', 'internship')) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.positions VALIDATE CONSTRAINT positions_employment_type_check;
