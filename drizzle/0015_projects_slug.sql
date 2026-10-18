-- Readable project URLs: /projects/{slug}
--
-- Adds projects.slug (text, nullable) and backfills it from name:
--   1. Unicode NFKD, then drop combining marks (strip accents)
--   2. lowercase
--   3. any non-alphanumeric run becomes one hyphen
--   4. trim leading and trailing hyphens
--   5. an empty result becomes "project"
--   6. a digits-only result, or a reserved word (new, create, edit, archived,
--      settings, discussion, api), gets "-project" appended so a slug can never
--      look like a numeric id or a route
-- Collisions are resolved in id order. The earliest row keeps the base slug;
-- later rows with the same base get -2, -3, and so on. Rows that already have
-- a slug are left alone, so re-running this file will not rewrite links.
-- Archived projects get slugs too, so their old links keep resolving.
--
-- Hand-authored (schema.ts is drifted, so do not drizzle-kit generate this).
-- NOT YET APPLIED. Review, then run the whole file once, manually, in the
-- Supabase SQL editor, BEFORE the app code that uses slugs is merged.
-- Idempotent: ADD COLUMN / CREATE UNIQUE INDEX use IF NOT EXISTS, and the
-- backfill only fills NULL slugs.
--
-- The app works with or without this column: until it exists (or while a slug
-- is NULL), links stay numeric and nothing redirects.
--
-- NOT NULL is set separately in 0016_projects_slug_not_null.sql, AFTER the slug
-- code is live in production. Setting it earlier would make project creation on
-- the currently deployed code (which does not write slug) fail.
--
-- The expression matches slugifyProjectName() in src/lib/project-slug.ts.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS slug text;

DO $$
DECLARE
  r record;
  base text;
  candidate text;
  n integer;
BEGIN
  FOR r IN
    SELECT id, name
    FROM projects
    WHERE slug IS NULL
    ORDER BY id
  LOOP
    -- NFKD + strip U+0300–U+036F, lowercase, non-alphanumerics to one hyphen.
    base := COALESCE(
      NULLIF(
        btrim(
          regexp_replace(
            lower(
              regexp_replace(
                normalize(COALESCE(r.name, ''), NFKD),
                U&'[\0300-\036F]',
                '',
                'g'
              )
            ),
            '[^a-z0-9]+',
            '-',
            'g'
          ),
          '-'
        ),
        ''
      ),
      'project'
    );
    IF base ~ '^[0-9]+$'
       OR base IN ('new', 'create', 'edit', 'archived', 'settings', 'discussion', 'api') THEN
      base := base || '-project';
    END IF;

    candidate := base;
    n := 2;
    WHILE EXISTS (SELECT 1 FROM projects p WHERE p.slug = candidate) LOOP
      candidate := base || '-' || n;
      n := n + 1;
      IF n > 10000 THEN
        RAISE EXCEPTION 'project slug collision loop exceeded 10000 for id %', r.id;
      END IF;
    END LOOP;

    UPDATE projects
       SET slug = candidate
     WHERE id = r.id
       AND slug IS NULL;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS projects_slug_unique_idx ON projects (slug);

-- Check after running (expect 0):
--   SELECT count(*) FROM projects WHERE slug IS NULL;

-- Rollback (commented out — do not run as part of this migration):
-- DROP INDEX IF EXISTS projects_slug_unique_idx;
-- ALTER TABLE projects DROP COLUMN IF EXISTS slug;
