-- Persistent live ping records for accountability and admin history.
-- Apply via Supabase SQL Editor or docs/migrations/add-presence-pings.sql.

CREATE TABLE IF NOT EXISTS "presence_pings" (
  "id"                text PRIMARY KEY,
  "from_user_id"      integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "from_name"         text NOT NULL,
  "from_role"         text NOT NULL,
  "from_team"         text,
  "from_photo_url"    text,
  "to_user_id"        integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "message"           text NOT NULL,
  "response_message"  text,
  "status"            text NOT NULL DEFAULT 'pending',
  "created_at"        text NOT NULL,
  "deadline_at"       text NOT NULL,
  "acknowledged_at"   text,
  "missed_at"         text,
  "updated_at"        text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "presence_pings_status_chk" CHECK ("status" IN ('pending','acknowledged','missed'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "presence_pings_from_created_idx"
  ON "presence_pings" ("from_user_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "presence_pings_to_created_idx"
  ON "presence_pings" ("to_user_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "presence_pings_status_deadline_idx"
  ON "presence_pings" ("status", "deadline_at");
