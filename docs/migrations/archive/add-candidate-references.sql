-- Run AFTER add-candidate-pre-employment-forms.sql.
-- Creates Recruitment-owned character-reference rows from the submitted
-- Background Check form. It does not touch legacy onboarder_references.

CREATE TABLE IF NOT EXISTS candidate_references (
  id                  SERIAL PRIMARY KEY,
  candidate_id        INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  submission_id       INTEGER NOT NULL REFERENCES candidate_pre_employment_submissions(id) ON DELETE CASCADE,
  reference_number    SMALLINT NOT NULL CHECK (reference_number BETWEEN 1 AND 3),
  referee_name        TEXT NOT NULL,
  referee_email       TEXT NOT NULL,
  referee_phone       TEXT,
  referee_company     TEXT,
  referee_job_title   TEXT,
  relationship        TEXT,
  best_time_to_call   TEXT,
  request_sent_at     TIMESTAMPTZ,
  responded_at        TIMESTAMPTZ,
  outcome             TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT candidate_references_submission_number_unique
    UNIQUE (submission_id, reference_number)
);

CREATE INDEX IF NOT EXISTS candidate_references_candidate_idx
  ON candidate_references(candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS candidate_references_pending_send_idx
  ON candidate_references(candidate_id)
  WHERE request_sent_at IS NULL;

ALTER TABLE candidate_references ENABLE ROW LEVEL SECURITY;

-- Backfill any background-check submissions that were received before this
-- table was introduced. Only entries with both a name and email become
-- operational reference rows.
INSERT INTO candidate_references (
  candidate_id, submission_id, reference_number, referee_name, referee_email,
  referee_phone, referee_company, referee_job_title, relationship, best_time_to_call
)
SELECT
  submission.candidate_id,
  submission.id,
  item.reference_number,
  NULLIF(BTRIM(submission.payload ->> format('reference_%s_name', item.reference_number)), ''),
  NULLIF(BTRIM(submission.payload ->> format('reference_%s_email', item.reference_number)), ''),
  NULLIF(BTRIM(submission.payload ->> format('reference_%s_phone', item.reference_number)), ''),
  NULLIF(BTRIM(submission.payload ->> format('reference_%s_company', item.reference_number)), ''),
  NULLIF(BTRIM(submission.payload ->> format('reference_%s_jobTitle', item.reference_number)), ''),
  NULLIF(BTRIM(submission.payload ->> format('reference_%s_relationship', item.reference_number)), ''),
  NULLIF(BTRIM(submission.payload ->> format('reference_%s_bestTimetoCall', item.reference_number)), '')
FROM candidate_pre_employment_submissions AS submission
CROSS JOIN LATERAL (SELECT generate_series(1, 3)::SMALLINT AS reference_number) AS item
WHERE submission.form_key = 'background_check'
  AND NULLIF(BTRIM(submission.payload ->> format('reference_%s_name', item.reference_number)), '') IS NOT NULL
  AND NULLIF(BTRIM(submission.payload ->> format('reference_%s_email', item.reference_number)), '') IS NOT NULL
ON CONFLICT (submission_id, reference_number) DO NOTHING;

-- Replace the generic submission writer so future BG submissions create the
-- three normalized candidate_references rows in the same transaction.
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
  submission_id_value INTEGER;
  effective_submitted_at TIMESTAMPTZ := COALESCE(p_submitted_at, NOW());
  reference_index SMALLINT;
  reference_name TEXT;
  reference_email TEXT;
BEGIN
  SELECT * INTO request_row
  FROM candidate_pre_employment_requests
  WHERE form_key = p_form_key
    AND token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown pre-employment request token'; END IF;
  IF request_row.invalidated_at IS NOT NULL THEN RAISE EXCEPTION 'Pre-employment request has been invalidated'; END IF;
  IF request_row.submitted_at IS NOT NULL THEN RAISE EXCEPTION 'Pre-employment request has already been submitted'; END IF;
  IF request_row.expires_at <= NOW() THEN RAISE EXCEPTION 'Pre-employment request has expired'; END IF;

  INSERT INTO candidate_pre_employment_submissions (
    request_id, candidate_id, form_key, provider, provider_submission_id,
    submitted_at, payload
  ) VALUES (
    request_row.id, request_row.candidate_id, p_form_key, p_provider,
    p_provider_submission_id, effective_submitted_at, p_payload
  ) RETURNING id INTO submission_id_value;

  IF p_form_key = 'background_check' THEN
    FOR reference_index IN 1..3 LOOP
      reference_name := NULLIF(BTRIM(p_payload ->> format('reference_%s_name', reference_index)), '');
      reference_email := NULLIF(BTRIM(p_payload ->> format('reference_%s_email', reference_index)), '');
      IF reference_name IS NOT NULL AND reference_email IS NOT NULL THEN
        INSERT INTO candidate_references (
          candidate_id, submission_id, reference_number, referee_name, referee_email,
          referee_phone, referee_company, referee_job_title, relationship, best_time_to_call
        ) VALUES (
          request_row.candidate_id, submission_id_value, reference_index, reference_name, reference_email,
          NULLIF(BTRIM(p_payload ->> format('reference_%s_phone', reference_index)), ''),
          NULLIF(BTRIM(p_payload ->> format('reference_%s_company', reference_index)), ''),
          NULLIF(BTRIM(p_payload ->> format('reference_%s_jobTitle', reference_index)), ''),
          NULLIF(BTRIM(p_payload ->> format('reference_%s_relationship', reference_index)), ''),
          NULLIF(BTRIM(p_payload ->> format('reference_%s_bestTimetoCall', reference_index)), '')
        );
      END IF;
    END LOOP;
  END IF;

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
