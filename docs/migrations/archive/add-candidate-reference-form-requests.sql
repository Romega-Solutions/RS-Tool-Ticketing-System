-- Run AFTER add-candidate-references.sql.
-- One secure, expiring Jotform link per referee. These are separate from the
-- candidate-facing Background Check request because the external recipient is
-- the referee, not the candidate.

CREATE TABLE IF NOT EXISTS candidate_reference_form_requests (
  id                    SERIAL PRIMARY KEY,
  reference_id          INTEGER NOT NULL REFERENCES candidate_references(id) ON DELETE CASCADE,
  token_hash            TEXT NOT NULL UNIQUE,
  sent_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at            TIMESTAMPTZ NOT NULL,
  submitted_at          TIMESTAMPTZ,
  invalidated_at        TIMESTAMPTZ,
  provider              TEXT,
  provider_submission_id TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT candidate_reference_form_requests_expiry_check CHECK (expires_at > sent_at)
);

CREATE INDEX IF NOT EXISTS candidate_reference_form_requests_reference_idx
  ON candidate_reference_form_requests(reference_id, created_at DESC);

CREATE TABLE IF NOT EXISTS candidate_reference_form_submissions (
  id                    SERIAL PRIMARY KEY,
  request_id            INTEGER NOT NULL REFERENCES candidate_reference_form_requests(id) ON DELETE CASCADE,
  reference_id          INTEGER NOT NULL REFERENCES candidate_references(id) ON DELETE CASCADE,
  provider              TEXT NOT NULL,
  provider_submission_id TEXT NOT NULL,
  submitted_at          TIMESTAMPTZ NOT NULL,
  payload               JSONB NOT NULL,
  received_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT candidate_reference_form_submissions_provider_id_unique UNIQUE (provider, provider_submission_id)
);

ALTER TABLE candidate_reference_form_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_reference_form_submissions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION record_candidate_reference_form_submission(
  p_token_hash TEXT,
  p_provider TEXT,
  p_provider_submission_id TEXT,
  p_submitted_at TIMESTAMPTZ,
  p_payload JSONB
)
RETURNS TABLE (reference_id INTEGER, candidate_id INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_row candidate_reference_form_requests%ROWTYPE;
  reference_row candidate_references%ROWTYPE;
  effective_submitted_at TIMESTAMPTZ := COALESCE(p_submitted_at, NOW());
BEGIN
  SELECT * INTO request_row
  FROM candidate_reference_form_requests
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown reference request token'; END IF;
  IF request_row.invalidated_at IS NOT NULL THEN RAISE EXCEPTION 'Reference request has been invalidated'; END IF;
  IF request_row.submitted_at IS NOT NULL THEN RAISE EXCEPTION 'Reference request has already been submitted'; END IF;
  IF request_row.expires_at <= NOW() THEN RAISE EXCEPTION 'Reference request has expired'; END IF;

  SELECT * INTO reference_row FROM candidate_references WHERE id = request_row.reference_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reference no longer exists'; END IF;

  INSERT INTO candidate_reference_form_submissions (
    request_id, reference_id, provider, provider_submission_id, submitted_at, payload
  ) VALUES (
    request_row.id, request_row.reference_id, p_provider, p_provider_submission_id,
    effective_submitted_at, p_payload
  );

  UPDATE candidate_reference_form_requests
  SET submitted_at = effective_submitted_at,
      provider = p_provider,
      provider_submission_id = p_provider_submission_id
  WHERE id = request_row.id;

  UPDATE candidate_references
  SET responded_at = effective_submitted_at
  WHERE id = reference_row.id;

  RETURN QUERY SELECT reference_row.id, reference_row.candidate_id;
END;
$$;

REVOKE ALL ON FUNCTION record_candidate_reference_form_submission(TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_candidate_reference_form_submission(TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB)
  TO service_role;
