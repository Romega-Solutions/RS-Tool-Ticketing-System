ALTER TABLE "projects" ADD COLUMN "auto_archive_done_days" integer DEFAULT 30;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "archived_at" text;