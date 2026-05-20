-- Add a `team` column to projects so the /projects list can default-filter
-- to the current lead's team. Idempotent — safe to re-run.
--
-- Values are free-form text (e.g. 'Design', 'Dev', 'Sales', 'Marketing').
-- Match the values you use in users.team — same casing.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS team TEXT;

CREATE INDEX IF NOT EXISTS projects_team_idx ON projects(team);
