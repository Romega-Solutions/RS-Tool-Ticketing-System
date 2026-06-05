-- Run this in Supabase → SQL Editor → New query, or via
--   npx tsx --env-file=.env scripts/apply-talent-consent-migration.ts
--
-- Adds the GDPR consent gate for the public Talent Pool. A candidate can only
-- be published (is_public_talent = TRUE) once consent_status = 'agreed'.
--
-- Consent is obtained via an n8n email containing a one-click confirm link
-- (/api/public/talents/confirm/<token>) which records the agreement with the
-- click IP + timestamp (consent_method = 'link'). Recruiters may also mark
-- agreement manually when they hold written proof (consent_method = 'manual').
-- A revoke link (/api/public/talents/revoke/<token>) honors right-to-withdraw.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS consent_status       TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS consent_token        TEXT,
  ADD COLUMN IF NOT EXISTS consent_requested_at TEXT,
  ADD COLUMN IF NOT EXISTS consent_agreed_at    TEXT,
  ADD COLUMN IF NOT EXISTS consent_agreed_ip    TEXT,
  ADD COLUMN IF NOT EXISTS consent_method       TEXT;

-- Unguessable token is the lookup key for the public confirm/revoke links.
CREATE UNIQUE INDEX IF NOT EXISTS candidates_consent_token_idx
  ON candidates(consent_token)
  WHERE consent_token IS NOT NULL;
