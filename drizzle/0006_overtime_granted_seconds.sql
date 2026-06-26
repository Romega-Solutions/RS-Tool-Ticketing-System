ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "created_by" integer;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "application_code" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "last_email_template" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "last_email_sent_at" text;--> statement-breakpoint
ALTER TABLE "overtime_requests" ADD COLUMN IF NOT EXISTS "granted_seconds" integer;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD COLUMN IF NOT EXISTS "meetings" text;--> statement-breakpoint
-- Backfill granted_seconds for overtime approved under the previous "approval
-- window" model, recovering the original bounded grant from (approved_until −
-- decided_at) so a current-week approval keeps its raised allowance after this
-- migration. Without this, a user approved just before deploy would be wrongly
-- hard-locked (NULL grant → treated as 0 → allowance stays at the 15h base).
UPDATE "overtime_requests"
SET "granted_seconds" = GREATEST(0, ROUND(EXTRACT(EPOCH FROM ("approved_until"::timestamptz - "decided_at"::timestamptz))))::int
WHERE "status" = 'approved'
  AND "granted_seconds" IS NULL
  AND "approved_until" IS NOT NULL
  AND "decided_at" IS NOT NULL;
