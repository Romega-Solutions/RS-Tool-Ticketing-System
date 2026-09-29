-- Audit trail for task comments: edits and deletes leave a footprint in the
-- task's Activity timeline ("Edited by X on …" / "Deleted by X on …").
-- Deletes become soft deletes — the row stays so the timeline can show who
-- removed it and when; the body is blanked and never served once deleted_at is set.
--
-- Mirrors drizzle/0011_comment_audit_trail.sql. Additive + idempotent. Apply with:
--   npx tsx --env-file=.env scripts/apply-migration.ts docs/migrations/add-work-item-comment-audit-trail.sql
--
-- REVERSIBLE (note: rows soft-deleted before rollback would reappear with an empty body):
--   ALTER TABLE work_item_comments
--     DROP COLUMN IF EXISTS edited_at,
--     DROP COLUMN IF EXISTS edited_by,
--     DROP COLUMN IF EXISTS deleted_at,
--     DROP COLUMN IF EXISTS deleted_by;

ALTER TABLE work_item_comments
  ADD COLUMN IF NOT EXISTS edited_at  text,
  ADD COLUMN IF NOT EXISTS edited_by  integer REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at text,
  ADD COLUMN IF NOT EXISTS deleted_by integer REFERENCES users(id) ON DELETE SET NULL;

-- VERIFY (should return 4 rows):
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'work_item_comments'
--     AND column_name IN ('edited_at', 'edited_by', 'deleted_at', 'deleted_by');
