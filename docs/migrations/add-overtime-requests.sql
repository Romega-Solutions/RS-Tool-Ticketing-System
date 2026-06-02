-- Overtime admin-approval queue.
-- Apply via Supabase SQL Editor. Replaces the old self-consent model:
-- overtime is now requested by the contractor and granted by an admin, who
-- sets approved_until (default: end of the requester's local day). While an
-- approval is active it suspends both the 3h session cap and the 15h weekly
-- cap for that user. See docs/superpowers/specs/2026-06-02-overtime-admin-gate-design.md.

CREATE TABLE IF NOT EXISTS "overtime_requests" (
  "id"             serial PRIMARY KEY,
  "user_id"        integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "week_start"     text NOT NULL,                    -- Monday of the target week (YYYY-MM-DD)
  "status"         text NOT NULL DEFAULT 'pending',  -- pending | approved | denied
  "reason"         text,
  "requested_at"   timestamptz NOT NULL DEFAULT now(),
  "decided_by"     integer REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at"     timestamptz,
  "approved_until" timestamptz,
  CONSTRAINT "overtime_requests_status_chk" CHECK ("status" IN ('pending','approved','denied'))
);

CREATE INDEX IF NOT EXISTS "overtime_requests_user_idx"   ON "overtime_requests" ("user_id");
CREATE INDEX IF NOT EXISTS "overtime_requests_status_idx" ON "overtime_requests" ("status");
-- Fast "is there an active approval for this user?" lookup used by the cron + clock-in.
CREATE INDEX IF NOT EXISTS "overtime_requests_approval_idx" ON "overtime_requests" ("user_id", "status", "approved_until");
