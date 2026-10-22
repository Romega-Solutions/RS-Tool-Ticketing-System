-- Rollback for drizzle/0018_sow_end_reminders.sql.
-- Drops the SOW reminder log. The send history is lost, so after re-applying
-- 0018 set SOW_ALERTS_START_DATE to the re-launch date to avoid re-sending
-- milestones that already went out. Turn the cron off first
-- (SOW_ALERTS_MODE=off) so it does not hit a missing table.
DROP TABLE IF EXISTS public.sow_end_reminders;
