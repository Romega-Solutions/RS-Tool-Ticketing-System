-- Run in Supabase SQL Editor before enabling Recruitment → Pre-Employment
-- form delivery. This is a generic capability-link/request store: new forms
-- reuse these tables by assigning a new form_key rather than adding a token
-- column to candidates.

CREATE TABLE IF NOT EXISTS candidate_pre_employment_requests (
  id                    SERIAL PRIMARY KEY,
  candidate_id          INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  form_key              TEXT NOT NULL,
  token_hash            TEXT NOT NULL UNIQUE,
  created_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sent_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at            TIMESTAMPTZ NOT NULL,
  submitted_at          TIMESTAMPTZ,
  invalidated_at        TIMESTAMPTZ,
  provider              TEXT,
  provider_submission_id TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT candidate_pre_employment_requests_expiry_check
    CHECK (expires_at > sent_at)
);

CREATE INDEX IF NOT EXISTS candidate_pre_employment_requests_candidate_form_idx
  ON candidate_pre_employment_requests(candidate_id, form_key, created_at DESC);

CREATE INDEX IF NOT EXISTS candidate_pre_employment_requests_open_idx
  ON candidate_pre_employment_requests(form_key, expires_at)
  WHERE submitted_at IS NULL AND invalidated_at IS NULL;

CREATE TABLE IF NOT EXISTS candidate_pre_employment_submissions (
  id                    SERIAL PRIMARY KEY,
  request_id            INTEGER NOT NULL REFERENCES candidate_pre_employment_requests(id) ON DELETE CASCADE,
  candidate_id          INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  form_key              TEXT NOT NULL,
  provider              TEXT NOT NULL,
  provider_submission_id TEXT NOT NULL,
  submitted_at          TIMESTAMPTZ NOT NULL,
  payload               JSONB NOT NULL,
  received_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT candidate_pre_employment_submissions_provider_id_unique
    UNIQUE (provider, provider_submission_id)
);

CREATE INDEX IF NOT EXISTS candidate_pre_employment_submissions_candidate_idx
  ON candidate_pre_employment_submissions(candidate_id, form_key, submitted_at DESC);

-- No browser-facing policies: requests and submissions are private HR data.
-- The app and the n8n intake endpoint use the Supabase service-role client,
-- which bypasses RLS; anon and authenticated clients receive no table access.
ALTER TABLE candidate_pre_employment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_pre_employment_submissions ENABLE ROW LEVEL SECURITY;

-- Atomically validates a request link, saves the provider payload, and marks
-- the request used. n8n calls the application endpoint; only the server's
-- service-role key can execute this RPC.
CREATE OR REPLACE FUNCTION record_candidate_pre_employment_submission(
  p_form_key TEXT,
  p_token_hash TEXT,
  p_provider TEXT,
  p_provider_submission_id TEXT,
  p_submitted_at TIMESTAMPTZ,
  p_payload JSONB
)
RETURNS TABLE (request_id INTEGER, candidate_id INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_row candidate_pre_employment_requests%ROWTYPE;
  effective_submitted_at TIMESTAMPTZ := COALESCE(p_submitted_at, NOW());
BEGIN
  SELECT * INTO request_row
  FROM candidate_pre_employment_requests
  WHERE form_key = p_form_key
    AND token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown pre-employment request token';
  END IF;
  IF request_row.invalidated_at IS NOT NULL THEN
    RAISE EXCEPTION 'Pre-employment request has been invalidated';
  END IF;
  IF request_row.submitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Pre-employment request has already been submitted';
  END IF;
  IF request_row.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Pre-employment request has expired';
  END IF;

  INSERT INTO candidate_pre_employment_submissions (
    request_id, candidate_id, form_key, provider, provider_submission_id,
    submitted_at, payload
  ) VALUES (
    request_row.id, request_row.candidate_id, p_form_key, p_provider,
    p_provider_submission_id, effective_submitted_at, p_payload
  );

  UPDATE candidate_pre_employment_requests
  SET submitted_at = effective_submitted_at,
      provider = p_provider,
      provider_submission_id = p_provider_submission_id
  WHERE id = request_row.id;

  RETURN QUERY SELECT request_row.id, request_row.candidate_id;
END;
$$;

REVOKE ALL ON FUNCTION record_candidate_pre_employment_submission(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_candidate_pre_employment_submission(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB)
  TO service_role;
