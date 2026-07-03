-- Run this in Supabase -> SQL Editor -> New query
-- Adds a durable link between candidate rows and ATS positions.
--
-- Older rows only stored candidates.position = positions.job_title. That made
-- "show applicants on this job post" fragile when a job title was edited.

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS position_id INTEGER REFERENCES positions(id) ON DELETE SET NULL;

WITH matched AS (
  SELECT c.id AS candidate_id, MIN(p.id) AS position_id
    FROM candidates c
    JOIN positions p
      ON p.job_title = c.position
   WHERE c.position_id IS NULL
   GROUP BY c.id
)
UPDATE candidates c
   SET position_id = matched.position_id
  FROM matched
 WHERE c.id = matched.candidate_id;

CREATE INDEX IF NOT EXISTS candidates_position_id_idx
  ON candidates(position_id);
