-- Run this in Supabase → SQL Editor → New query
-- Internal Onboarding MVP — Phase D (onboarder-facing surfaces).
--
-- Adds a single flag on the users table that drives the in-app welcome
-- banner on /my-tasks and unlocks the two intake forms
-- (/my-tasks/onboarding-intake and /my-tasks/onboarding-intern-intake).
--
-- Flag is flipped to TRUE when the HRBP creates the user row for a new hire,
-- and to FALSE when the onboarder reaches `regularized` status.
--
-- Safe to re-run.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_onboarding BOOLEAN NOT NULL DEFAULT FALSE;
