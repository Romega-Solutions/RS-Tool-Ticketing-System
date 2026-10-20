-- Backup for drizzle/0017_two_step_time_approvals.sql. Run this FIRST.
--
-- Copies timesheet_edit_requests (every row and column, as it is now) into
-- timesheet_edit_requests_backup_0017. Refuses to overwrite an existing backup,
-- so a second run cannot replace a good copy with a post-migration one.
-- RLS is turned on for the copy, like every other public table, so it is not
-- readable through the public API. Drop it once the change has settled:
--   DROP TABLE timesheet_edit_requests_backup_0017;

DO $$
BEGIN
  IF to_regclass('public.timesheet_edit_requests_backup_0017') IS NOT NULL THEN
    RAISE EXCEPTION 'timesheet_edit_requests_backup_0017 already exists; keep it, or drop it on purpose before taking a new backup';
  END IF;
END $$;

CREATE TABLE timesheet_edit_requests_backup_0017 AS
  SELECT * FROM timesheet_edit_requests;

ALTER TABLE timesheet_edit_requests_backup_0017 ENABLE ROW LEVEL SECURITY;

-- Check: the two counts should match.
SELECT (SELECT count(*) FROM timesheet_edit_requests)             AS live_rows,
       (SELECT count(*) FROM timesheet_edit_requests_backup_0017) AS backup_rows;
