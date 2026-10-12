-- Departments + reporting lines. The portal is the source of truth for who
-- reports to whom; `users` is not altered (department stays in users.team).
-- No user_reporting row / null reports_to_user_id = reports to the founder.
--
-- Hand-authored (schema.ts is drifted from the live DB, so `drizzle-kit generate`
-- is unsafe to blindly apply). Additive + idempotent. Apply with:
--   npx tsx --env-file=.env scripts/apply-migration.ts drizzle/0013_departments_reporting_lines.sql
-- Storage bucket for photos: docs/migrations/add-user-photos-bucket.sql
CREATE TABLE IF NOT EXISTS departments (
  id            serial PRIMARY KEY NOT NULL,
  name          text NOT NULL UNIQUE,
  color         text,
  display_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_reporting (
  user_id            integer PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE cascade,
  reports_to_user_id integer REFERENCES users(id) ON DELETE set null,
  photo_path         text,
  display_order      integer NOT NULL DEFAULT 0,
  is_hidden          boolean NOT NULL DEFAULT false,
  updated_at         text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_reporting_not_self CHECK (reports_to_user_id IS NULL OR reports_to_user_id <> user_id)
);

CREATE INDEX IF NOT EXISTS user_reporting_reports_to_idx ON user_reporting USING btree (reports_to_user_id);

CREATE TABLE IF NOT EXISTS user_secondary_leads (
  user_id                 integer NOT NULL REFERENCES users(id) ON DELETE cascade,
  also_reports_to_user_id integer NOT NULL REFERENCES users(id) ON DELETE cascade,
  PRIMARY KEY (user_id, also_reports_to_user_id),
  CONSTRAINT user_secondary_leads_not_self CHECK (user_id <> also_reports_to_user_id)
);

CREATE INDEX IF NOT EXISTS user_secondary_leads_also_reports_to_idx ON user_secondary_leads USING btree (also_reports_to_user_id);

-- New tables default to RLS-disabled (world-readable via the anon key). The app
-- uses the service-role client / DATABASE_URL owner, which bypass RLS.
ALTER TABLE departments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reporting       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_secondary_leads ENABLE ROW LEVEL SECURITY;

-- Seed the department list used by User Management (DEPARTMENTS in
-- src/components/user-management-table.tsx).
INSERT INTO departments (name, display_order) VALUES
  ('Technical', 1),
  ('HR', 2),
  ('Sales', 3),
  ('Marketing', 4),
  ('Market Intelligence', 5),
  ('Management', 6)
ON CONFLICT (name) DO NOTHING;
