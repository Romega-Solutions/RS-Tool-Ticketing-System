-- Canonical, idempotent setup for Recruitment > Pre-Employment.
--
-- Run this single file in the Supabase SQL editor for a new environment or
-- an environment that was set up with the older incremental migrations. It is
-- additive: it preserves submitted forms, references, verification responses,
-- and uploaded documents. It does not migrate legacy onboarding data.
--
-- The older add-candidate-pre-employment-*.sql files are retained as history;
-- do not run their full chain for a new environment after using this file.

-- Also reconcile the Recruitment -> Onboarding handoff's internal lead link.
-- It is conditional because this file can still be used in an environment
-- where the optional Onboarding module has not yet been installed.
DO $$
DECLARE
  status_constraint_name TEXT;
BEGIN
  IF to_regclass('public.onboarders') IS NOT NULL THEN
    ALTER TABLE onboarders
      ADD COLUMN IF NOT EXISTS onboarding_lead_id INTEGER
      REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS direct_supervisor_id INTEGER
      REFERENCES users(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS onboarders_onboarding_lead_id_idx
      ON onboarders(onboarding_lead_id);
    CREATE INDEX IF NOT EXISTS onboarders_direct_supervisor_id_idx
      ON onboarders(direct_supervisor_id);

    -- Backfill only unambiguous historical lead names; never guess a user.
    UPDATE onboarders AS onboarder
    SET onboarding_lead_id = matched_user.id
    FROM users AS matched_user
    WHERE onboarder.onboarding_lead_id IS NULL
      AND onboarder.onboarding_lead IS NOT NULL
      AND LOWER(BTRIM(onboarder.onboarding_lead)) = LOWER(BTRIM(matched_user.name))
      AND (
        SELECT COUNT(*)
        FROM users AS possible_user
        WHERE LOWER(BTRIM(possible_user.name)) = LOWER(BTRIM(onboarder.onboarding_lead))
      ) = 1;

    -- Apply the same safe, unambiguous backfill for existing supervisor names.
    UPDATE onboarders AS onboarder
    SET direct_supervisor_id = matched_user.id
    FROM users AS matched_user
    WHERE onboarder.direct_supervisor_id IS NULL
      AND onboarder.direct_supervisor IS NOT NULL
      AND LOWER(BTRIM(onboarder.direct_supervisor)) = LOWER(BTRIM(matched_user.name))
      AND (
        SELECT COUNT(*)
        FROM users AS possible_user
        WHERE LOWER(BTRIM(possible_user.name)) = LOWER(BTRIM(onboarder.direct_supervisor))
      ) = 1;

    -- These stages now belong to Recruitment. Preserve existing rows by moving
    -- them to the first onboarding stage before the allowed-status check is
    -- tightened.
    UPDATE onboarders
    SET status = 'pre_onboarding'
    WHERE status IN ('offer_signed', 'background_check');

    ALTER TABLE onboarders
      ALTER COLUMN status SET DEFAULT 'pre_onboarding';

    -- Constraint names differ between older environments, so remove only CHECK
    -- constraints on the status column, then install the canonical one.
    FOR status_constraint_name IN
      SELECT constraint_row.conname
      FROM pg_constraint AS constraint_row
      WHERE constraint_row.conrelid = 'public.onboarders'::regclass
        AND constraint_row.contype = 'c'
        AND EXISTS (
          SELECT 1
          FROM unnest(constraint_row.conkey) AS status_key(attnum)
          JOIN pg_attribute AS attribute_row
            ON attribute_row.attrelid = constraint_row.conrelid
           AND attribute_row.attnum = status_key.attnum
          WHERE attribute_row.attname = 'status'
        )
    LOOP
      EXECUTE format('ALTER TABLE public.onboarders DROP CONSTRAINT IF EXISTS %I', status_constraint_name);
    END LOOP;

    ALTER TABLE onboarders
      ADD CONSTRAINT onboarders_status_check
      CHECK (status IN (
        'pre_onboarding', 'day_one', 'thirty_day', 'ninety_day',
        'regularized', 'failed_probation', 'withdrew'
      ));
  END IF;
END;
$$;

-- Candidate-facing Background Check capability links and raw submissions.
CREATE TABLE IF NOT EXISTS candidate_pre_employment_requests (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  form_key TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ,
  invalidated_at TIMESTAMPTZ,
  provider TEXT,
  provider_submission_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT candidate_pre_employment_requests_expiry_check CHECK (expires_at > sent_at)
);

CREATE TABLE IF NOT EXISTS candidate_pre_employment_submissions (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES candidate_pre_employment_requests(id) ON DELETE CASCADE,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  form_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_submission_id TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT candidate_pre_employment_submissions_provider_id_unique UNIQUE (provider, provider_submission_id)
);

CREATE INDEX IF NOT EXISTS candidate_pre_employment_requests_candidate_form_idx
  ON candidate_pre_employment_requests(candidate_id, form_key, created_at DESC);
CREATE INDEX IF NOT EXISTS candidate_pre_employment_requests_open_idx
  ON candidate_pre_employment_requests(form_key, expires_at)
  WHERE submitted_at IS NULL AND invalidated_at IS NULL;
CREATE INDEX IF NOT EXISTS candidate_pre_employment_submissions_candidate_idx
  ON candidate_pre_employment_submissions(candidate_id, form_key, submitted_at DESC);

-- Recruitment-owned character references and their one-time referee links.
CREATE TABLE IF NOT EXISTS candidate_references (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  submission_id INTEGER NOT NULL REFERENCES candidate_pre_employment_submissions(id) ON DELETE CASCADE,
  reference_number SMALLINT NOT NULL CHECK (reference_number BETWEEN 1 AND 3),
  referee_name TEXT NOT NULL,
  referee_email TEXT NOT NULL,
  referee_phone TEXT,
  referee_company TEXT,
  referee_job_title TEXT,
  relationship TEXT,
  best_time_to_call TEXT,
  request_sent_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  outcome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT candidate_references_submission_number_unique UNIQUE (submission_id, reference_number)
);

CREATE TABLE IF NOT EXISTS candidate_reference_form_requests (
  id SERIAL PRIMARY KEY,
  reference_id INTEGER NOT NULL REFERENCES candidate_references(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ,
  invalidated_at TIMESTAMPTZ,
  provider TEXT,
  provider_submission_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT candidate_reference_form_requests_expiry_check CHECK (expires_at > sent_at)
);

CREATE TABLE IF NOT EXISTS candidate_reference_form_submissions (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES candidate_reference_form_requests(id) ON DELETE CASCADE,
  reference_id INTEGER NOT NULL REFERENCES candidate_references(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_submission_id TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT candidate_reference_form_submissions_provider_id_unique UNIQUE (provider, provider_submission_id)
);

CREATE INDEX IF NOT EXISTS candidate_references_candidate_idx
  ON candidate_references(candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS candidate_references_pending_send_idx
  ON candidate_references(candidate_id) WHERE request_sent_at IS NULL;
CREATE INDEX IF NOT EXISTS candidate_reference_form_requests_reference_idx
  ON candidate_reference_form_requests(reference_id, created_at DESC);

-- Recruitment-owned employment verification records and employer links.
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
  CONSTRAINT candidate_employment_verifications_submission_number_unique UNIQUE (submission_id, verification_number)
);

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT candidate_employment_verification_requests_expiry_check CHECK (expires_at > sent_at)
);

CREATE TABLE IF NOT EXISTS candidate_employment_verification_form_submissions (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES candidate_employment_verification_form_requests(id) ON DELETE CASCADE,
  verification_id INTEGER NOT NULL REFERENCES candidate_employment_verifications(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_submission_id TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT candidate_employment_verification_form_submissions_provider_id_unique UNIQUE (provider, provider_submission_id)
);

CREATE INDEX IF NOT EXISTS candidate_employment_verifications_candidate_idx
  ON candidate_employment_verifications(candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS candidate_employment_verification_requests_idx
  ON candidate_employment_verification_form_requests(verification_id, created_at DESC);

-- Uploaded documents. The ALTER statements reconcile environments that had
-- an earlier version of this table before send/sign tracking was added.
CREATE TABLE IF NOT EXISTS candidate_pre_employment_documents (
  id SERIAL PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('sow', 'job_description', 'ai_policy', 'nda')),
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  signed_url TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  CONSTRAINT candidate_pre_employment_documents_candidate_kind_unique UNIQUE (candidate_id, kind)
);

ALTER TABLE candidate_pre_employment_documents
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
ALTER TABLE candidate_pre_employment_documents
  DROP CONSTRAINT IF EXISTS candidate_pre_employment_documents_kind_check;
ALTER TABLE candidate_pre_employment_documents
  ADD CONSTRAINT candidate_pre_employment_documents_kind_check
  CHECK (kind IN ('sow', 'job_description', 'ai_policy', 'nda'));

-- This application accesses this HR data only through server-side service-role
-- clients. With RLS enabled and no policies, browser clients cannot read it.
ALTER TABLE candidate_pre_employment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_pre_employment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_reference_form_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_reference_form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_employment_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_employment_verification_form_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_employment_verification_form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_pre_employment_documents ENABLE ROW LEVEL SECURITY;

-- Keep the private storage bucket in sync, including DOCX support.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'candidate-pre-employment-docs',
  'candidate-pre-employment-docs',
  false,
  10000000,
  ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Backfill normalized references from already received candidate submissions.
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

-- Backfill normalized employer contacts from already received candidate submissions.
INSERT INTO candidate_employment_verifications (
  candidate_id, submission_id, verification_number, company, hr_contact_name,
  hr_email, hr_phone, best_time_to_call
)
SELECT
  submission.candidate_id,
  submission.id,
  item.verification_number,
  NULLIF(BTRIM(submission.payload ->> format('employer_%s_company', item.verification_number)), ''),
  NULLIF(BTRIM(submission.payload ->> format('employer_%s_hr_contact_name', item.verification_number)), ''),
  NULLIF(BTRIM(submission.payload ->> format('employer_%s_hr_email', item.verification_number)), ''),
  NULLIF(BTRIM(submission.payload ->> format('employer_%s_phone', item.verification_number)), ''),
  NULLIF(BTRIM(submission.payload ->> format('employer_%s_bestTimetoCall', item.verification_number)), '')
FROM candidate_pre_employment_submissions AS submission
CROSS JOIN LATERAL (SELECT generate_series(1, 3)::SMALLINT AS verification_number) AS item
WHERE submission.form_key = 'background_check'
  AND NULLIF(BTRIM(submission.payload ->> format('employer_%s_company', item.verification_number)), '') IS NOT NULL
  AND NULLIF(BTRIM(submission.payload ->> format('employer_%s_hr_email', item.verification_number)), '') IS NOT NULL
ON CONFLICT (submission_id, verification_number) DO NOTHING;

-- Candidate Background Check intake. It saves the raw submission and creates
-- the three operational reference rows atomically when supplied.
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
  WHERE form_key = p_form_key AND token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown pre-employment request token'; END IF;
  IF request_row.invalidated_at IS NOT NULL THEN RAISE EXCEPTION 'Pre-employment request has been invalidated'; END IF;
  IF request_row.submitted_at IS NOT NULL THEN RAISE EXCEPTION 'Pre-employment request has already been submitted'; END IF;
  IF request_row.expires_at <= NOW() THEN RAISE EXCEPTION 'Pre-employment request has expired'; END IF;

  INSERT INTO candidate_pre_employment_submissions (
    request_id, candidate_id, form_key, provider, provider_submission_id, submitted_at, payload
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
  SET submitted_at = effective_submitted_at, provider = p_provider, provider_submission_id = p_provider_submission_id
  WHERE id = request_row.id;

  RETURN QUERY SELECT request_row.id, request_row.candidate_id;
END;
$$;

-- New candidate submissions receive normalized employer records via trigger.
CREATE OR REPLACE FUNCTION sync_candidate_employment_verifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  verification_index SMALLINT;
  company_value TEXT;
  email_value TEXT;
BEGIN
  IF NEW.form_key <> 'background_check' THEN RETURN NEW; END IF;

  FOR verification_index IN 1..3 LOOP
    company_value := NULLIF(BTRIM(NEW.payload ->> format('employer_%s_company', verification_index)), '');
    email_value := NULLIF(BTRIM(NEW.payload ->> format('employer_%s_hr_email', verification_index)), '');
    IF company_value IS NOT NULL AND email_value IS NOT NULL THEN
      INSERT INTO candidate_employment_verifications (
        candidate_id, submission_id, verification_number, company, hr_contact_name,
        hr_email, hr_phone, best_time_to_call
      ) VALUES (
        NEW.candidate_id, NEW.id, verification_index, company_value,
        NULLIF(BTRIM(NEW.payload ->> format('employer_%s_hr_contact_name', verification_index)), ''),
        email_value,
        NULLIF(BTRIM(NEW.payload ->> format('employer_%s_phone', verification_index)), ''),
        NULLIF(BTRIM(NEW.payload ->> format('employer_%s_bestTimetoCall', verification_index)), '')
      ) ON CONFLICT (submission_id, verification_number) DO NOTHING;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS candidate_employment_verifications_after_bg_submission ON candidate_pre_employment_submissions;
CREATE TRIGGER candidate_employment_verifications_after_bg_submission
AFTER INSERT ON candidate_pre_employment_submissions
FOR EACH ROW EXECUTE FUNCTION sync_candidate_employment_verifications();

-- One-time referee submissions.
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
  SELECT * INTO request_row FROM candidate_reference_form_requests
  WHERE token_hash = p_token_hash FOR UPDATE;
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
  SET submitted_at = effective_submitted_at, provider = p_provider, provider_submission_id = p_provider_submission_id
  WHERE id = request_row.id;
  UPDATE candidate_references SET responded_at = effective_submitted_at WHERE id = reference_row.id;

  RETURN QUERY SELECT reference_row.id, reference_row.candidate_id;
END;
$$;

-- One-time employer verification submissions.
CREATE OR REPLACE FUNCTION record_candidate_employment_verification_form_submission(
  p_token_hash TEXT,
  p_provider TEXT,
  p_provider_submission_id TEXT,
  p_submitted_at TIMESTAMPTZ,
  p_payload JSONB
)
RETURNS TABLE (verification_id INTEGER, candidate_id INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_row candidate_employment_verification_form_requests%ROWTYPE;
  verification_row candidate_employment_verifications%ROWTYPE;
  effective_submitted_at TIMESTAMPTZ := COALESCE(p_submitted_at, NOW());
BEGIN
  SELECT * INTO request_row FROM candidate_employment_verification_form_requests
  WHERE token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown employment verification request token'; END IF;
  IF request_row.invalidated_at IS NOT NULL THEN RAISE EXCEPTION 'Employment verification request has been invalidated'; END IF;
  IF request_row.submitted_at IS NOT NULL THEN RAISE EXCEPTION 'Employment verification request has already been submitted'; END IF;
  IF request_row.expires_at <= NOW() THEN RAISE EXCEPTION 'Employment verification request has expired'; END IF;

  SELECT * INTO verification_row FROM candidate_employment_verifications
  WHERE id = request_row.verification_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employment verification record no longer exists'; END IF;

  INSERT INTO candidate_employment_verification_form_submissions (
    request_id, verification_id, provider, provider_submission_id, submitted_at, payload
  ) VALUES (
    request_row.id, request_row.verification_id, p_provider, p_provider_submission_id,
    effective_submitted_at, p_payload
  );

  UPDATE candidate_employment_verification_form_requests
  SET submitted_at = effective_submitted_at, provider = p_provider, provider_submission_id = p_provider_submission_id
  WHERE id = request_row.id;
  UPDATE candidate_employment_verifications SET responded_at = effective_submitted_at WHERE id = verification_row.id;

  RETURN QUERY SELECT verification_row.id, verification_row.candidate_id;
END;
$$;

REVOKE ALL ON FUNCTION record_candidate_pre_employment_submission(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_candidate_pre_employment_submission(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB)
  TO service_role;
REVOKE ALL ON FUNCTION record_candidate_reference_form_submission(TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_candidate_reference_form_submission(TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB)
  TO service_role;
REVOKE ALL ON FUNCTION record_candidate_employment_verification_form_submission(TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_candidate_employment_verification_form_submission(TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB)
  TO service_role;
