-- Readable project URLs, step 2: make projects.slug NOT NULL.
--
-- Run ONLY after:
--   1. 0015_projects_slug.sql has been applied, and
--   2. the app code that writes a slug on project create is live in production.
-- Re-run 0015 first (it is idempotent) to fill any project created in between.
--
-- Hand-authored. NOT YET APPLIED. Run manually in the Supabase SQL editor.

DO $$
DECLARE
  missing integer;
BEGIN
  SELECT count(*) INTO missing FROM projects WHERE slug IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION '% project(s) still have no slug; re-run 0015_projects_slug.sql first', missing;
  END IF;
END $$;

ALTER TABLE projects
  ALTER COLUMN slug SET NOT NULL;

-- Rollback (commented out — do not run as part of this migration):
-- ALTER TABLE projects ALTER COLUMN slug DROP NOT NULL;
