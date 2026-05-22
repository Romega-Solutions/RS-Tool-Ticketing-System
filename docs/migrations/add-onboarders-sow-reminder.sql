-- Run this in Supabase → SQL Editor → New query
-- Internal Onboarding — Phase F (sweeps cron).
--
-- Adds a single dedup column on `onboarders` so the daily n8n sweep can fire
-- the SOW reminder at most once per onboarder. Without this we'd nag HRBP
-- every day for the same unsigned SOW.
--
-- Safe to re-run.

ALTER TABLE onboarders
  ADD COLUMN IF NOT EXISTS sow_reminder_sent_at TIMESTAMPTZ;

-- onboarder_references + onboarder_employment_verifications already have
-- request_sent_at + responded_at, so the sweep's referee non-response query
-- doesn't need a dedup column — we just exclude rows where
-- request_sent_at < 24h ago (treating each request as fresh for one cycle).
