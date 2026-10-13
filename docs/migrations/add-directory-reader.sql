-- ─────────────────────────────────────────────────────────────────────────────
-- directory schema + directory_reader login — read-only people data for other
-- internal apps (the Org Chart). The portal stays the source of truth.
-- ─────────────────────────────────────────────────────────────────────────────
-- Every public table has RLS on with no policies, so a plain read-only role
-- would see zero rows. Instead the reader only gets views in `directory`; the
-- views are owned by the migration role and read the base tables on its
-- behalf. Only safe columns are exposed — password_hash, rates, birthdays,
-- etc. don't exist from the reader's point of view.
--
-- Default lead: an empty reports_to resolves to the founder (by email below),
-- except for the founder himself, who is the root (NULL).
--
-- Photos: build the URL in the consuming app as
--   <SUPABASE_URL>/storage/v1/object/public/user-photos/<photo_path>
--
-- Connect (Supabase pooler): user `directory_reader.<project-ref>`.
--
-- Replace <PASSWORD> before running. Never commit the real password.
-- Re-runnable: views are replaced; the role is only created if missing.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS directory;

CREATE OR REPLACE VIEW directory.people AS
WITH founder AS (
  SELECT id FROM public.users WHERE lower(email) = 'robbie@romega-solutions.com' LIMIT 1
)
SELECT
  u.id,
  u.name,
  u.email,
  u.job_title,
  u.team                     AS department,
  (u.is_active = 1)          AS is_active,
  u.end_date,
  CASE WHEN u.id = (SELECT id FROM founder) THEN NULL
       ELSE COALESCE(r.reports_to_user_id, (SELECT id FROM founder))
  END                        AS reports_to_user_id,
  r.photo_path,
  COALESCE(r.display_order, 0) AS display_order,
  COALESCE(r.is_hidden, false) AS is_hidden
FROM public.users u
LEFT JOIN public.user_reporting r ON r.user_id = u.id;

CREATE OR REPLACE VIEW directory.secondary_leads AS
SELECT user_id, also_reports_to_user_id
FROM public.user_secondary_leads;

CREATE OR REPLACE VIEW directory.departments AS
SELECT name, color, display_order
FROM public.departments;

-- Keep the schema away from the Supabase API roles.
REVOKE ALL ON SCHEMA directory FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA directory FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'directory_reader') THEN
    CREATE ROLE directory_reader LOGIN PASSWORD '<PASSWORD>' NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA directory TO directory_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA directory TO directory_reader;

-- VERIFY (as postgres):
--   SELECT * FROM directory.people ORDER BY name;
-- VERIFY (as directory_reader — should fail):
--   SELECT * FROM public.users LIMIT 1;
