-- Readable public apply slugs for positions.
--
-- Adds positions.slug (text) and backfills it from job_title:
--   1. Unicode NFKD, then drop combining marks (strip accents)
--   2. lowercase
--   3. any non-alphanumeric run, including em dash, becomes one hyphen
--   4. trim leading and trailing hyphens
--   5. an empty result becomes "position"
-- Collisions are resolved in id order. The earliest row keeps the base slug;
-- the next rows with the same base get -2, -3, and so on. Rows that already
-- have a slug are left alone, so re-running this file will not rewrite links.
--
-- Hand-authored (schema.ts is drifted, so do not drizzle-kit generate this).
-- NOT YET APPLIED. Review and run the whole file once, manually, in the
-- Supabase SQL editor. Idempotent: ADD COLUMN / CREATE UNIQUE INDEX use
-- IF NOT EXISTS, and the backfill only fills NULL slugs.
--
-- The expression matches slugifyPositionTitle() in
-- src/lib/recruiting/position-slug.ts.

ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS slug text;

DO $$
DECLARE
  r record;
  base text;
  candidate text;
  n integer;
BEGIN
  FOR r IN
    SELECT id, job_title
    FROM positions
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
                normalize(COALESCE(r.job_title, ''), NFKD),
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
      'position'
    );
    candidate := base;
    n := 2;
    WHILE EXISTS (SELECT 1 FROM positions p WHERE p.slug = candidate) LOOP
      candidate := base || '-' || n;
      n := n + 1;
      IF n > 10000 THEN
        RAISE EXCEPTION 'position slug collision loop exceeded 10000 for id %', r.id;
      END IF;
    END LOOP;

    UPDATE positions
       SET slug = candidate
     WHERE id = r.id
       AND slug IS NULL;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS positions_slug_unique_idx ON positions (slug);

-- Rollback (commented out — do not run as part of this migration):
-- DROP INDEX IF EXISTS positions_slug_unique_idx;
-- ALTER TABLE positions DROP COLUMN IF EXISTS slug;
