-- Run this in Supabase → SQL Editor → New query
-- Adds:
--   1. candidates.created_by  — user who added the row (separate from assigned_to)
--   2. candidate_history      — append-only audit log for ATS edits
--   3. positions              — open roles tracked in the Applicant Tracking System

-- 1. created_by ---------------------------------------------------------------

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Backfill: assume the existing assignee was also the person who added the row.
UPDATE candidates
   SET created_by = assigned_to
 WHERE created_by IS NULL
   AND assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS candidates_created_by_idx ON candidates(created_by);

-- 2. candidate_history --------------------------------------------------------

CREATE TABLE IF NOT EXISTS candidate_history (
  id            SERIAL PRIMARY KEY,
  candidate_id  INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_name     TEXT,        -- snapshot at write time (survives user renames / deletes)
  field         TEXT NOT NULL,  -- e.g. 'name', 'email', 'phone', 'status', 'education'
  old_value     TEXT,        -- stringified previous value (null on creation events)
  new_value     TEXT,        -- stringified new value      (null on deletion events)
  summary       TEXT NOT NULL, -- prebuilt human-readable line, e.g.
                              --   "Name changed from 'JuAn dela cruz' to 'Juan Dela Cruz'"
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS candidate_history_candidate_idx
  ON candidate_history(candidate_id, created_at DESC);

-- 3. positions ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS positions (
  id              SERIAL PRIMARY KEY,
  job_title       TEXT NOT NULL,
  client          TEXT,
  location        TEXT,
  job_description TEXT,
  is_open         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS positions_open_idx       ON positions(is_open);
CREATE INDEX IF NOT EXISTS positions_created_by_idx ON positions(created_by);
