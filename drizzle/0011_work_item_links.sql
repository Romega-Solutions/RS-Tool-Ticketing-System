-- "Related links" section on a task: a titled URL per row. Adding/removing a
-- link is logged to work_item_activity (link_added / link_removed) by the API.
--
-- Hand-authored (schema.ts is drifted from the live DB, so `drizzle-kit generate`
-- is unsafe to blindly apply). Additive + idempotent. Apply with:
--   npx tsx --env-file=.env scripts/apply-migration.ts drizzle/0011_work_item_links.sql
CREATE TABLE IF NOT EXISTS work_item_links (
  id           serial PRIMARY KEY NOT NULL,
  work_item_id integer NOT NULL REFERENCES work_items(id) ON DELETE cascade,
  title        text NOT NULL,
  url          text NOT NULL,
  created_by   integer REFERENCES users(id) ON DELETE set null,
  created_at   text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS work_item_links_work_item_idx ON work_item_links USING btree (work_item_id);
