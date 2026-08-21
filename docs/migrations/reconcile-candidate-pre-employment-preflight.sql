-- Run this ON STAGING immediately before
-- reconcile-candidate-pre-employment.sql.
--
-- This is a safety snapshot, not an application migration. It is valid only
-- for the staging baseline that was audited on 2026-08-21: no pre-employment
-- tables or onboarding_sessions table exist yet.
--
-- It records the original onboarder statuses and storage-bucket configuration
-- needed by the guarded rollback companion. Keep these backup tables until
-- the staging deployment is accepted.

BEGIN;

DO $$
DECLARE
  object_name TEXT;
  new_column_name TEXT;
BEGIN
  IF to_regclass('public.onboarders') IS NULL THEN
    RAISE EXCEPTION 'Preflight stopped: public.onboarders does not exist.';
  END IF;

  FOREACH object_name IN ARRAY ARRAY[
    'public.onboarding_sessions',
    'public.candidate_pre_employment_requests',
    'public.candidate_pre_employment_submissions',
    'public.candidate_references',
    'public.candidate_reference_form_requests',
    'public.candidate_reference_form_submissions',
    'public.candidate_employment_verifications',
    'public.candidate_employment_verification_form_requests',
    'public.candidate_employment_verification_form_submissions',
    'public.candidate_pre_employment_documents'
  ] LOOP
    IF to_regclass(object_name) IS NOT NULL THEN
      RAISE EXCEPTION 'Preflight stopped: % already exists. This rollback plan is only for the audited staging baseline.', object_name;
    END IF;
  END LOOP;

  FOREACH new_column_name IN ARRAY ARRAY[
    'onboarding_lead_id',
    'direct_supervisor_id',
    'onboarding_session_id',
    'meeting_availability',
    'meeting_availability_submitted_at',
    'onboarding_form_token_hash'
  ] LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'onboarders'
        AND column_name = new_column_name
    ) THEN
      RAISE EXCEPTION 'Preflight stopped: onboarders.% already exists. This rollback plan is only for the audited staging baseline.', new_column_name;
    END IF;
  END LOOP;

  FOREACH object_name IN ARRAY ARRAY[
    'public.record_candidate_pre_employment_submission(text,text,text,text,timestamptz,jsonb)',
    'public.sync_candidate_employment_verifications()',
    'public.record_candidate_reference_form_submission(text,text,text,timestamptz,jsonb)',
    'public.record_candidate_employment_verification_form_submission(text,text,text,timestamptz,jsonb)'
  ] LOOP
    IF to_regprocedure(object_name) IS NOT NULL THEN
      RAISE EXCEPTION 'Preflight stopped: function % already exists. This rollback plan cannot safely restore it.', object_name;
    END IF;
  END LOOP;
END;
$$;

CREATE SCHEMA IF NOT EXISTS migration_backups;

CREATE TABLE IF NOT EXISTS migration_backups.reconcile_candidate_pre_employment_onboarders_before (
  onboarder_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL
);

TRUNCATE migration_backups.reconcile_candidate_pre_employment_onboarders_before;

INSERT INTO migration_backups.reconcile_candidate_pre_employment_onboarders_before (
  onboarder_id, status, captured_at
)
SELECT id, status, NOW()
FROM public.onboarders;

CREATE TABLE IF NOT EXISTS migration_backups.reconcile_candidate_pre_employment_bucket_before (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  bucket_existed BOOLEAN NOT NULL,
  is_public BOOLEAN,
  file_size_limit BIGINT,
  allowed_mime_types TEXT[],
  captured_at TIMESTAMPTZ NOT NULL
);

TRUNCATE migration_backups.reconcile_candidate_pre_employment_bucket_before;

INSERT INTO migration_backups.reconcile_candidate_pre_employment_bucket_before (
  singleton, bucket_existed, is_public, file_size_limit, allowed_mime_types, captured_at
)
SELECT
  TRUE,
  EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'candidate-pre-employment-docs'),
  (SELECT public FROM storage.buckets WHERE id = 'candidate-pre-employment-docs'),
  (SELECT file_size_limit FROM storage.buckets WHERE id = 'candidate-pre-employment-docs'),
  (SELECT allowed_mime_types FROM storage.buckets WHERE id = 'candidate-pre-employment-docs'),
  NOW();

COMMIT;
