-- Audit trail for admin edits to attendance + timesheet records.
-- Lightweight model: store who last edited and when, surfaced as a
-- "Edited by <name> on <date>" tooltip in the attendance tracker.
--
-- Apply against Supabase Postgres (DATABASE_URL pooler) or via the SQL editor.

ALTER TABLE "timesheets"
  ADD COLUMN IF NOT EXISTS "edited_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "edited_at" text;

ALTER TABLE "attendance"
  ADD COLUMN IF NOT EXISTS "edited_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "edited_at" text;
