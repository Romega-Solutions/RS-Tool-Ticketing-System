-- Project Activity footprint + Archived tab support.
-- Adds projects.archived_at so the "Project Activity" feed can derive
-- created + archived events, and the Archived tab can sort by archive time.
-- Backfills existing already-archived projects with their updated_at as a
-- best-effort archive timestamp (so they appear in the footprint immediately).

ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_at text;

UPDATE projects
   SET archived_at = updated_at
 WHERE archived = 1
   AND archived_at IS NULL;
