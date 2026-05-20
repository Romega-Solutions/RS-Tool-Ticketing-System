-- Tracks when a user's overtime consent extension expires.
-- Set by POST /api/presence/overtime-consent when the user clicks
-- "Yes, continue working" in the overtime guardrail dialog.
-- Read by GET /api/cron/auto-clock-out to enforce the 5-minute
-- response window for sessions whose browsers have been closed.
ALTER TABLE timesheets
ADD COLUMN IF NOT EXISTS overtime_consent_until TIMESTAMPTZ;
