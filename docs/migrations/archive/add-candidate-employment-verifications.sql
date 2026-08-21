-- Run AFTER add-candidate-pre-employment-forms.sql.
-- Recruitment-owned prior-employer verification records and one-time employer links.

CREATE TABLE IF NOT EXISTS candidate_employment_verifications (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  submission_id INTEGER NOT NULL REFERENCES candidate_pre_employment_submissions(id) ON DELETE CASCADE,
  verification_number SMALLINT NOT NULL CHECK (verification_number BETWEEN 1 AND 3),
  company TEXT NOT NULL,
  hr_contact_name TEXT,
  hr_email TEXT NOT NULL,
  hr_phone TEXT,
  best_time_to_call TEXT,
  request_sent_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  outcome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (submission_id, verification_number)
);
CREATE INDEX IF NOT EXISTS candidate_employment_verifications_candidate_idx ON candidate_employment_verifications(candidate_id, created_at DESC);
ALTER TABLE candidate_employment_verifications ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS candidate_employment_verification_form_requests (
  id SERIAL PRIMARY KEY,
  verification_id INTEGER NOT NULL REFERENCES candidate_employment_verifications(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ,
  invalidated_at TIMESTAMPTZ,
  provider TEXT,
  provider_submission_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS candidate_employment_verification_requests_idx ON candidate_employment_verification_form_requests(verification_id, created_at DESC);
ALTER TABLE candidate_employment_verification_form_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS candidate_employment_verification_form_submissions (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES candidate_employment_verification_form_requests(id) ON DELETE CASCADE,
  verification_id INTEGER NOT NULL REFERENCES candidate_employment_verifications(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_submission_id TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_submission_id)
);
ALTER TABLE candidate_employment_verification_form_submissions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION sync_candidate_employment_verifications()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i SMALLINT; company_value TEXT; email_value TEXT;
BEGIN
  IF NEW.form_key <> 'background_check' THEN RETURN NEW; END IF;
  FOR i IN 1..3 LOOP
    company_value := NULLIF(BTRIM(NEW.payload ->> format('employer_%s_company', i)), '');
    email_value := NULLIF(BTRIM(NEW.payload ->> format('employer_%s_hr_email', i)), '');
    IF company_value IS NOT NULL AND email_value IS NOT NULL THEN
      INSERT INTO candidate_employment_verifications (candidate_id, submission_id, verification_number, company, hr_contact_name, hr_email, hr_phone, best_time_to_call)
      VALUES (NEW.candidate_id, NEW.id, i, company_value,
        NULLIF(BTRIM(NEW.payload ->> format('employer_%s_hr_contact_name', i)), ''), email_value,
        NULLIF(BTRIM(NEW.payload ->> format('employer_%s_phone', i)), ''),
        NULLIF(BTRIM(NEW.payload ->> format('employer_%s_bestTimetoCall', i)), ''))
      ON CONFLICT (submission_id, verification_number) DO NOTHING;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS candidate_employment_verifications_after_bg_submission ON candidate_pre_employment_submissions;
CREATE TRIGGER candidate_employment_verifications_after_bg_submission
AFTER INSERT ON candidate_pre_employment_submissions FOR EACH ROW EXECUTE FUNCTION sync_candidate_employment_verifications();

INSERT INTO candidate_employment_verifications (candidate_id, submission_id, verification_number, company, hr_contact_name, hr_email, hr_phone, best_time_to_call)
SELECT s.candidate_id, s.id, n.i,
  NULLIF(BTRIM(s.payload ->> format('employer_%s_company', n.i)), ''),
  NULLIF(BTRIM(s.payload ->> format('employer_%s_hr_contact_name', n.i)), ''),
  NULLIF(BTRIM(s.payload ->> format('employer_%s_hr_email', n.i)), ''),
  NULLIF(BTRIM(s.payload ->> format('employer_%s_phone', n.i)), ''),
  NULLIF(BTRIM(s.payload ->> format('employer_%s_bestTimetoCall', n.i)), '')
FROM candidate_pre_employment_submissions s CROSS JOIN LATERAL (SELECT generate_series(1,3)::SMALLINT i) n
WHERE s.form_key = 'background_check'
  AND NULLIF(BTRIM(s.payload ->> format('employer_%s_company', n.i)), '') IS NOT NULL
  AND NULLIF(BTRIM(s.payload ->> format('employer_%s_hr_email', n.i)), '') IS NOT NULL
ON CONFLICT (submission_id, verification_number) DO NOTHING;

CREATE OR REPLACE FUNCTION record_candidate_employment_verification_form_submission(
  p_token_hash TEXT, p_provider TEXT, p_provider_submission_id TEXT, p_submitted_at TIMESTAMPTZ, p_payload JSONB
) RETURNS TABLE (verification_id INTEGER, candidate_id INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r candidate_employment_verification_form_requests%ROWTYPE; v candidate_employment_verifications%ROWTYPE; at TIMESTAMPTZ := COALESCE(p_submitted_at, NOW());
BEGIN
  SELECT * INTO r FROM candidate_employment_verification_form_requests WHERE token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown employment verification request token'; END IF;
  IF r.invalidated_at IS NOT NULL OR r.submitted_at IS NOT NULL OR r.expires_at <= NOW() THEN RAISE EXCEPTION 'Employment verification request is no longer active'; END IF;
  SELECT * INTO v FROM candidate_employment_verifications WHERE id = r.verification_id FOR UPDATE;
  INSERT INTO candidate_employment_verification_form_submissions (request_id, verification_id, provider, provider_submission_id, submitted_at, payload)
  VALUES (r.id, r.verification_id, p_provider, p_provider_submission_id, at, p_payload);
  UPDATE candidate_employment_verification_form_requests SET submitted_at = at, provider = p_provider, provider_submission_id = p_provider_submission_id WHERE id = r.id;
  UPDATE candidate_employment_verifications SET responded_at = at WHERE id = v.id;
  RETURN QUERY SELECT v.id, v.candidate_id;
END;
$$;
REVOKE ALL ON FUNCTION record_candidate_employment_verification_form_submission(TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_candidate_employment_verification_form_submission(TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB) TO service_role;
