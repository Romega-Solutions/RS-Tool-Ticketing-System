-- Threaded replies on task comments (Slack / Google Chat style).
-- A reply points at its top-level thread root via parent_id; deleting the root
-- removes its replies. One level deep — the API rejects replies to replies.
--
-- Hand-authored (schema.ts is drifted from the live DB, so `drizzle-kit generate`
-- is unsafe to blindly apply). Additive + idempotent. Apply with:
--   npx tsx --env-file=.env scripts/apply-migration.ts drizzle/0010_comment_threads.sql
ALTER TABLE work_item_comments
  ADD COLUMN IF NOT EXISTS parent_id integer REFERENCES work_item_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS work_item_comments_parent_idx ON work_item_comments USING btree (parent_id);
