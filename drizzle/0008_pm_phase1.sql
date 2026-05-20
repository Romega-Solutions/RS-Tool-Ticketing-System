-- Phase 1 — Internal PM Build Plan (replaces Plane.so)
-- Tables: work_item_comments, labels, work_item_labels, project_members, work_item_activity
-- Columns: work_item_assignees.user_id (FK), work_items.archived

-- 1. work_item_comments ----------------------------------------------------
CREATE TABLE IF NOT EXISTS "work_item_comments" (
  "id"           serial PRIMARY KEY NOT NULL,
  "work_item_id" integer NOT NULL,
  "author_id"    integer NOT NULL,
  "body"         text NOT NULL,
  "created_at"   text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "work_item_comments"
    ADD CONSTRAINT "work_item_comments_work_item_id_fkey"
    FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "work_item_comments"
    ADD CONSTRAINT "work_item_comments_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "work_item_comments_work_item_idx" ON "work_item_comments"("work_item_id");
--> statement-breakpoint

-- 2. labels --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "labels" (
  "id"         serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL,
  "name"       text NOT NULL,
  "color"      text NOT NULL DEFAULT '#6b7280'
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "labels"
    ADD CONSTRAINT "labels_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "labels"
    ADD CONSTRAINT "labels_project_name_unique" UNIQUE ("project_id", "name");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- 3. work_item_labels --------------------------------------------------------
CREATE TABLE IF NOT EXISTS "work_item_labels" (
  "id"           serial PRIMARY KEY NOT NULL,
  "work_item_id" integer NOT NULL,
  "label_id"     integer NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "work_item_labels"
    ADD CONSTRAINT "work_item_labels_work_item_id_fkey"
    FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "work_item_labels"
    ADD CONSTRAINT "work_item_labels_label_id_fkey"
    FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "work_item_labels"
    ADD CONSTRAINT "work_item_labels_unique" UNIQUE ("work_item_id", "label_id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- 4. project_members -----------------------------------------------------
CREATE TABLE IF NOT EXISTS "project_members" (
  "id"         serial PRIMARY KEY NOT NULL,
  "project_id" integer NOT NULL,
  "user_id"    integer NOT NULL,
  "role"       text NOT NULL DEFAULT 'member',
  "created_at" text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "project_members"
    ADD CONSTRAINT "project_members_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "project_members"
    ADD CONSTRAINT "project_members_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "project_members"
    ADD CONSTRAINT "project_members_unique" UNIQUE ("project_id", "user_id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- 5. work_item_activity --------------------------------------------------
CREATE TABLE IF NOT EXISTS "work_item_activity" (
  "id"           serial PRIMARY KEY NOT NULL,
  "work_item_id" integer NOT NULL,
  "actor_id"     integer NOT NULL,
  "action"       text NOT NULL,
  "from_value"   text,
  "to_value"     text,
  "created_at"   text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "work_item_activity"
    ADD CONSTRAINT "work_item_activity_work_item_id_fkey"
    FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "work_item_activity"
    ADD CONSTRAINT "work_item_activity_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "work_item_activity_work_item_idx" ON "work_item_activity"("work_item_id");
--> statement-breakpoint

-- 6. work_item_assignees.user_id (Open question #1 — § 10) ---------------
ALTER TABLE "work_item_assignees"
  ADD COLUMN IF NOT EXISTS "user_id" integer;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "work_item_assignees"
    ADD CONSTRAINT "work_item_assignees_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- Backfill user_id from member_key (== users.plane_member_id)
UPDATE "work_item_assignees" AS wia
SET    "user_id" = u."id"
FROM   "users" AS u
WHERE  wia."user_id" IS NULL
  AND  u."plane_member_id" = wia."member_key";
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "work_item_assignees_user_idx" ON "work_item_assignees"("user_id");
--> statement-breakpoint

-- 7. work_items.archived (Open question #5 — § 10) ------------------------
ALTER TABLE "work_items"
  ADD COLUMN IF NOT EXISTS "archived" integer NOT NULL DEFAULT 0;
