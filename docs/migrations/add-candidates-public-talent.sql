-- Run this in Supabase → SQL Editor → New query.
--
-- Adds the per-candidate "Publish to Talent Pool" toggle that drives the
-- public Talent showcase on https://www.romega-solutions.com/talent.
--
-- Default is FALSE so no candidate becomes public until a recruiter
-- explicitly publishes them. This matches the existing /careers privacy
-- promise ("No profile sharing without approval").

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS is_public_talent BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS candidates_public_talent_idx
  ON candidates(is_public_talent)
  WHERE is_public_talent = TRUE;
