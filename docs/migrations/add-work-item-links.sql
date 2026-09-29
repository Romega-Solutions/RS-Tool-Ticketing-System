-- =====================================================================
-- add-work-item-links.sql                                2026-09-25
-- "Related links" section on a task: a titled URL per row. Adding or
-- removing a link is logged to work_item_activity (link_added /
-- link_removed) by the API — no activity schema change needed.
--
-- One-paste version for the Supabase SQL editor. The table DDL mirrors
-- drizzle/0011_work_item_links.sql (canonical, keep in sync); the RLS
-- step is a non-table object and lives only here.
--
-- RLS: Postgres defaults new tables to RLS-disabled, which would leave
-- this table world-readable/writable via the anon key (same fix as
-- enable-rls-project-comments.sql). Safe with no policies: the app
-- reads/writes it through the service-role admin client, which
-- bypasses RLS.
--
-- Additive + idempotent — safe to re-run.
-- REVERSIBLE: DROP TABLE public.work_item_links;
-- =====================================================================

CREATE TABLE IF NOT EXISTS work_item_links (
  id           serial PRIMARY KEY NOT NULL,
  work_item_id integer NOT NULL REFERENCES work_items(id) ON DELETE cascade,
  title        text NOT NULL,
  url          text NOT NULL,
  created_by   integer REFERENCES users(id) ON DELETE set null,
  created_at   text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS work_item_links_work_item_idx ON work_item_links USING btree (work_item_id);

ALTER TABLE public.work_item_links ENABLE ROW LEVEL SECURITY;

-- VERIFY (should return 1 row with rowsecurity = true):
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE schemaname = 'public' AND tablename = 'work_item_links';
