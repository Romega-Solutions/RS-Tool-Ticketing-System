-- Run this in Supabase → SQL Editor → New query
-- Adds fields populated by the n8n "Romega ATS — Resume Extractor" workflow.
-- Schema matches the JSON returned by the workflow's `data` field.

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS location       TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS website        TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS summary        TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS skills         JSONB;   -- array of strings
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS experience     JSONB;   -- array of {company, title, start_date, end_date, description}
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS education      JSONB;   -- array of {institution, degree, field, graduation_year}
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS certifications JSONB;   -- array of strings
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS languages      JSONB;   -- array of strings
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS parsed_at      TEXT;    -- ISO timestamp of last successful parse
