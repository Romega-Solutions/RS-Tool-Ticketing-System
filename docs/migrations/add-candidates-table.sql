-- Run this in Supabase → SQL Editor → New query
-- Adds the `candidates` table used by /recruiting/candidates (lightweight ATS).
--
-- Modeled on the existing standalone RS_Tool-ATS but flattened: no separate
-- workspaces/jobs/pipeline-stage catalogs in v1 — just a single candidates table
-- with inline `position` and a status enum. If/when we need a full pipeline
-- per-job, split into jobs + applications tables.

CREATE TABLE IF NOT EXISTS candidates (
  id           SERIAL PRIMARY KEY,
  full_name    TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  position     TEXT,         -- the role applied for, e.g. "Frontend Developer"
  source       TEXT,         -- referral / linkedin / job_board / direct / manual
  status       TEXT NOT NULL DEFAULT 'applied',
  rating       INTEGER,      -- 1–5, nullable
  notes        TEXT,
  linkedin_url TEXT,
  resume_url   TEXT,
  assigned_to  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5))
);

CREATE INDEX IF NOT EXISTS candidates_status_idx      ON candidates(status);
CREATE INDEX IF NOT EXISTS candidates_position_idx    ON candidates(position);
CREATE INDEX IF NOT EXISTS candidates_assigned_to_idx ON candidates(assigned_to);

-- Allowed status values (enforced in app, indexed here for fast filtering):
--   applied     — application received
--   screening   — initial screening / phone screen
--   interview   — in active interview rounds
--   offer       — offer extended
--   hired       — accepted offer, onboarded
--   rejected    — closed-rejected (any stage)
