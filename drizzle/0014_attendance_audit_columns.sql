-- Audit trail for admin edits to attendance + timesheet records.
-- Apply via Supabase SQL Editor or docs/migrations/add-attendance-audit-columns.sql.

ALTER TABLE "timesheets"
  ADD COLUMN IF NOT EXISTS "edited_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "edited_at" text;

ALTER TABLE "attendance"
  ADD COLUMN IF NOT EXISTS "edited_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "edited_at" text;
