-- Run this in Supabase → SQL Editor → New query
-- Extends the ATS `positions` table (created by add-ats-history-and-positions.sql)
-- with the richer fields the Add Position form now collects:
--   placement_type  — Internal / External (replaces the old free-text `client`)
--   compensation    — free-text pay range
--   employment_type — Full time / Part time
--   openings        — headcount for the role
--
-- Note: the legacy `client` column is intentionally left in place (now unused by
-- the app) to avoid a destructive drop. It can be removed later once confirmed
-- nothing else reads it:  ALTER TABLE positions DROP COLUMN IF EXISTS client;

ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS placement_type  TEXT NOT NULL DEFAULT 'internal',   -- 'internal' | 'external'
  ADD COLUMN IF NOT EXISTS compensation    TEXT,
  ADD COLUMN IF NOT EXISTS employment_type TEXT NOT NULL DEFAULT 'full_time',  -- 'full_time' | 'part_time'
  ADD COLUMN IF NOT EXISTS openings        INTEGER NOT NULL DEFAULT 1;
