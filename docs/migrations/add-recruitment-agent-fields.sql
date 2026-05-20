-- Run this in Supabase → SQL Editor → New query
-- Recruitment AI Agent — fields needed for SOP automation:
--   1. candidates.application_code  — human-readable code APP-YYYY-NNNN
--   2. candidates.last_email_template + last_email_sent_at — dedup guard for n8n
--   3. Status remap: replace the 6-stage model with the SOP's 11 stages
--   4. Backfill application_code on existing rows (oldest first per year)
--
-- Safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. New columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS application_code    TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS last_email_template TEXT,
  ADD COLUMN IF NOT EXISTS last_email_sent_at  TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Sequence used by the app to mint new APP-YYYY-NNNN codes
-- ─────────────────────────────────────────────────────────────────────────────
-- The app calls `SELECT nextval('application_code_seq')` and formats it as
-- APP-{year}-{padded number} in the server action. The sequence is global
-- across years (simpler than per-year sequences); the year prefix still
-- communicates roughly when the application arrived.

CREATE SEQUENCE IF NOT EXISTS application_code_seq START WITH 1;

-- Postgres function exposed via Supabase RPC. The Next.js server action calls
-- `supabase.rpc('mint_application_code')` and writes the returned string into
-- candidates.application_code on insert.
CREATE OR REPLACE FUNCTION mint_application_code() RETURNS TEXT AS $$
DECLARE
  yr INTEGER;
  n  BIGINT;
BEGIN
  yr := EXTRACT(YEAR FROM NOW())::INTEGER;
  n  := nextval('application_code_seq');
  RETURN 'APP-' || yr || '-' || LPAD(n::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Status remap — 6 stages → SOP's 11 stages
-- ─────────────────────────────────────────────────────────────────────────────
-- Old → New mapping:
--   applied / screening  → pending_response
--   interview            → interview_romega
--   offer                → offered
--   rejected             → failed
--   hired                → hired (unchanged)

UPDATE candidates SET status = 'pending_response' WHERE status IN ('applied', 'screening');
UPDATE candidates SET status = 'interview_romega' WHERE status = 'interview';
UPDATE candidates SET status = 'offered'          WHERE status = 'offer';
UPDATE candidates SET status = 'failed'           WHERE status = 'rejected';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Backfill application_code for existing rows
-- ─────────────────────────────────────────────────────────────────────────────
-- Sequence number within each year, oldest first. Bumps the sequence past the
-- highest backfilled value so newly minted codes don't collide.

-- candidates.created_at is stored as TEXT (ISO 8601) per add-candidates-table.sql,
-- so EXTRACT() needs an explicit cast. NULLIF guards an empty string, and the
-- outer COALESCE falls back to "now" if the cast fails for some reason.
WITH ordered AS (
  SELECT id,
         COALESCE(
           EXTRACT(YEAR FROM NULLIF(created_at, '')::timestamptz)::int,
           EXTRACT(YEAR FROM NOW())::int
         ) AS yr,
         ROW_NUMBER() OVER (ORDER BY created_at, id) AS global_n
    FROM candidates
   WHERE application_code IS NULL
)
UPDATE candidates c
   SET application_code = 'APP-' || ordered.yr || '-' || LPAD(ordered.global_n::text, 4, '0')
  FROM ordered
 WHERE c.id = ordered.id;

-- Advance the sequence so future nextval() calls begin AFTER the backfill.
SELECT setval('application_code_seq',
              GREATEST(
                COALESCE((SELECT MAX(
                  CAST(SUBSTRING(application_code FROM 'APP-\d{4}-(\d+)') AS INTEGER)
                ) FROM candidates WHERE application_code ~ '^APP-\d{4}-\d+$'), 0),
                1
              ),
              true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Helpful index
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS candidates_status_email_idx
  ON candidates(status, last_email_template);
