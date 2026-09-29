-- Audit trail for task comments: edits and deletes leave a footprint in the
-- task's Activity timeline ("Edited by X on …" / "Deleted by X on …").
-- Deletes become soft deletes — the row stays so the timeline can show who
-- removed it and when; the body is never returned once deleted_at is set.
--
-- Hand-authored (schema.ts is drifted from the live DB, so `drizzle-kit generate`
-- is unsafe to blindly apply). Additive + idempotent. Apply with:
--   npx tsx --env-file=.env scripts/apply-migration.ts drizzle/0011_comment_audit_trail.sql
ALTER TABLE work_item_comments
  ADD COLUMN IF NOT EXISTS edited_at  text,
  ADD COLUMN IF NOT EXISTS edited_by  integer REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at text,
  ADD COLUMN IF NOT EXISTS deleted_by integer REFERENCES users(id) ON DELETE SET NULL;
