-- Threaded replies on task comments (Slack / Google Chat style).
-- A reply points at its top-level thread root via parent_id; deleting the root
-- removes its replies. One level deep — the API rejects replies to replies.
--
-- Mirrors drizzle/0010_comment_threads.sql (shipped with PR #61, the merged
-- Comments + Activity timeline). Additive + idempotent. Apply with:
--   npx tsx --env-file=.env scripts/apply-migration.ts docs/migrations/add-work-item-comment-threads.sql
--
-- REVERSIBLE:
--   DROP INDEX IF EXISTS work_item_comments_parent_idx;
--   ALTER TABLE work_item_comments DROP COLUMN IF EXISTS parent_id;

ALTER TABLE work_item_comments
  ADD COLUMN IF NOT EXISTS parent_id integer REFERENCES work_item_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS work_item_comments_parent_idx ON work_item_comments USING btree (parent_id);

-- VERIFY (should return 1 row):
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'work_item_comments' AND column_name = 'parent_id';
