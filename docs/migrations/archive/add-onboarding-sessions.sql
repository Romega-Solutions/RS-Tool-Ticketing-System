-- Weekly Friday onboarding cohorts.
-- Safe to run once against the live Supabase database. This is additive: it
-- preserves all existing onboarder records and historical checklist data.

CREATE TABLE IF NOT EXISTS onboarding_sessions (
  id          SERIAL PRIMARY KEY,
  session_date DATE NOT NULL UNIQUE,
  starts_at   TIMESTAMPTZ NOT NULL,
  cutoff_at   TIMESTAMPTZ NOT NULL,
  status      TEXT NOT NULL DEFAULT 'scheduled'
              CHECK (status IN ('scheduled', 'finalized', 'cancelled')),
  finalized_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (cutoff_at < starts_at)
);

ALTER TABLE onboarders
  ADD COLUMN IF NOT EXISTS onboarding_session_id INTEGER
    REFERENCES onboarding_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS meeting_availability TEXT NOT NULL DEFAULT 'pending'
    CHECK (meeting_availability IN ('pending', 'yes', 'no')),
  ADD COLUMN IF NOT EXISTS meeting_availability_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_form_token_hash TEXT;

CREATE INDEX IF NOT EXISTS onboarders_onboarding_session_id_idx
  ON onboarders(onboarding_session_id);
CREATE INDEX IF NOT EXISTS onboarders_session_availability_idx
  ON onboarders(onboarding_session_id, meeting_availability);
CREATE UNIQUE INDEX IF NOT EXISTS onboarders_onboarding_form_token_hash_idx
  ON onboarders(onboarding_form_token_hash)
  WHERE onboarding_form_token_hash IS NOT NULL;
