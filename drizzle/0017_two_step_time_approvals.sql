-- Two-step approval for time-correction requests: the requester's main lead
-- (supervisor) decides first, then an admin. The timesheet only changes after
-- the admin step. A supervisor rejection is final.
--
--   stage                  'supervisor' | 'admin' | 'done'. NULL is treated by
--                          the app as the admin step (rows filed by older code).
--   supervisor_id          the requester's main lead when the request was filed
--   supervisor_decision    'approved' | 'denied' (NULL = not decided / skipped)
--   supervisor_note        the supervisor's note or rejection reason
--   supervisor_decided_at  when the supervisor decided
--   supervisor_reminded_at when the one "still waiting" reminder went out
--
-- The admin step keeps using the existing decided_by / decided_at /
-- decision_comment columns, so no new admin note column is needed.
--
-- Hand-authored. Additive and idempotent: safe to run more than once. Re-run it
-- right after the new code is deployed to place any request filed in between.
-- Take a backup first: docs/migrations/0017-two-step-time-approvals-backup.sql
-- Undo:                docs/migrations/0017-two-step-time-approvals-rollback.sql
-- Apply with:
--   npx tsx --env-file=.env scripts/apply-migration.ts drizzle/0017_two_step_time_approvals.sql

ALTER TABLE timesheet_edit_requests ADD COLUMN IF NOT EXISTS stage                  text;
ALTER TABLE timesheet_edit_requests ADD COLUMN IF NOT EXISTS supervisor_id          integer;
ALTER TABLE timesheet_edit_requests ADD COLUMN IF NOT EXISTS supervisor_decision    text;
ALTER TABLE timesheet_edit_requests ADD COLUMN IF NOT EXISTS supervisor_note        text;
ALTER TABLE timesheet_edit_requests ADD COLUMN IF NOT EXISTS supervisor_decided_at  text;
ALTER TABLE timesheet_edit_requests ADD COLUMN IF NOT EXISTS supervisor_reminded_at text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'timesheet_edit_requests_supervisor_id_fk') THEN
    ALTER TABLE timesheet_edit_requests
      ADD CONSTRAINT timesheet_edit_requests_supervisor_id_fk
      FOREIGN KEY (supervisor_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'timesheet_edit_requests_stage_check') THEN
    ALTER TABLE timesheet_edit_requests
      ADD CONSTRAINT timesheet_edit_requests_stage_check
      CHECK (stage IS NULL OR stage IN ('supervisor', 'admin', 'done'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'timesheet_edit_requests_supervisor_decision_check') THEN
    ALTER TABLE timesheet_edit_requests
      ADD CONSTRAINT timesheet_edit_requests_supervisor_decision_check
      CHECK (supervisor_decision IS NULL OR supervisor_decision IN ('approved', 'denied'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS timesheet_edit_requests_supervisor_idx
  ON timesheet_edit_requests USING btree (supervisor_id);
CREATE INDEX IF NOT EXISTS timesheet_edit_requests_status_stage_idx
  ON timesheet_edit_requests USING btree (status, stage);

-- Decided requests are finished.
UPDATE timesheet_edit_requests
   SET stage = 'done'
 WHERE stage IS NULL
   AND status <> 'pending';

-- Pending requests join the new flow. Supervisor = the requester's main lead
-- (user_reporting.reports_to_user_id), defaulting to the founder when unset,
-- the same rule the app uses. They go to the admin step instead when there is
-- no usable supervisor (the requester is the founder, the lead is inactive or
-- missing) or the supervisor is an admin or the founder.
WITH founder AS (
  SELECT id
    FROM users
   WHERE is_active = 1
     AND lower(trim(role)) IN ('founder', 'ceo', 'owner')
   ORDER BY CASE lower(trim(role)) WHEN 'founder' THEN 0 WHEN 'ceo' THEN 1 ELSE 2 END, id
   LIMIT 1
),
resolved AS (
  SELECT r.id,
         CASE
           WHEN r.user_id = (SELECT id FROM founder) THEN NULL
           ELSE COALESCE(
             (SELECT u.id FROM user_reporting ur JOIN users u ON u.id = ur.reports_to_user_id
               WHERE ur.user_id = r.user_id),
             (SELECT id FROM founder))
         END AS supervisor_id
    FROM timesheet_edit_requests r
   WHERE r.stage IS NULL
     AND r.status = 'pending'
)
UPDATE timesheet_edit_requests t
   SET supervisor_id = res.supervisor_id,
       stage = CASE
         WHEN res.supervisor_id IS NULL OR res.supervisor_id = t.user_id THEN 'admin'
         WHEN EXISTS (
           SELECT 1 FROM users s
            WHERE s.id = res.supervisor_id
              AND s.is_active = 1
              AND lower(trim(s.role)) NOT IN ('admin', 'ceo', 'founder', 'owner', 'superadmin')
         ) THEN 'supervisor'
         ELSE 'admin'
       END
  FROM resolved res
 WHERE t.id = res.id;
