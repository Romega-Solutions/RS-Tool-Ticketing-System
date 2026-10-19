-- Rollback for drizzle/0017_two_step_time_approvals.sql.
--
-- Removes the two-step approval columns, constraints and indexes. Every request
-- keeps its status, so pending ones go back to the single-step queue. Requests
-- denied by a supervisor stay denied (decided_by / decision_comment already
-- hold the supervisor's decision); only the supervisor-step detail is lost.
-- Deploy the previous app code before or together with this, since the new
-- code reads these columns. Idempotent: safe to run more than once.
--
-- To restore the table exactly as it was before 0017 instead, use the copy
-- from docs/migrations/0017-two-step-time-approvals-backup.sql (see the end).

BEGIN;

ALTER TABLE timesheet_edit_requests DROP CONSTRAINT IF EXISTS timesheet_edit_requests_supervisor_id_fk;
ALTER TABLE timesheet_edit_requests DROP CONSTRAINT IF EXISTS timesheet_edit_requests_stage_check;
ALTER TABLE timesheet_edit_requests DROP CONSTRAINT IF EXISTS timesheet_edit_requests_supervisor_decision_check;

DROP INDEX IF EXISTS timesheet_edit_requests_supervisor_idx;
DROP INDEX IF EXISTS timesheet_edit_requests_status_stage_idx;

ALTER TABLE timesheet_edit_requests DROP COLUMN IF EXISTS supervisor_reminded_at;
ALTER TABLE timesheet_edit_requests DROP COLUMN IF EXISTS supervisor_decided_at;
ALTER TABLE timesheet_edit_requests DROP COLUMN IF EXISTS supervisor_note;
ALTER TABLE timesheet_edit_requests DROP COLUMN IF EXISTS supervisor_decision;
ALTER TABLE timesheet_edit_requests DROP COLUMN IF EXISTS supervisor_id;
ALTER TABLE timesheet_edit_requests DROP COLUMN IF EXISTS stage;

COMMIT;

-- Optional, only if the request data itself must go back to the backup copy
-- (this discards every request filed or decided after the backup was taken):
--
-- BEGIN;
-- DELETE FROM timesheet_edit_requests;
-- INSERT INTO timesheet_edit_requests SELECT * FROM timesheet_edit_requests_backup_0017;
-- SELECT setval(pg_get_serial_sequence('timesheet_edit_requests', 'id'),
--               GREATEST((SELECT max(id) FROM timesheet_edit_requests), 1));
-- COMMIT;
