-- Apply via Supabase SQL Editor.
-- Adds the column the overtime auto-clock-out cron relies on.
ALTER TABLE timesheets
ADD COLUMN IF NOT EXISTS overtime_consent_until TIMESTAMPTZ;
