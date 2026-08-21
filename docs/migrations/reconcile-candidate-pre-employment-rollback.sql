-- Guarded rollback for reconcile-candidate-pre-employment.sql.
--
-- Preconditions:
--   1. The preflight companion was run immediately before the forward migration.
--   2. The application is in maintenance mode.
--   3. No new pre-employment/onboarding-session records were created after the
--      forward migration. This script checks that and stops if it is not true.
--
-- This is for the audited staging baseline only. Do not use it to undo an
-- older incremental pre-employment setup. It intentionally retains the backup
-- records in migration_backups for audit/recovery.

BEGIN;

LOCK TABLE public.onboarders IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  table_name TEXT;
  new_onboarder_count BIGINT;
  bucket_existed_before BOOLEAN;
BEGIN
  IF to_regclass('migration_backups.reconcile_candidate_pre_employment_onboarders_before') IS NULL
     OR to_regclass('migration_backups.reconcile_candidate_pre_employment_bucket_before') IS NULL THEN
    RAISE EXCEPTION 'Rollback stopped: preflight backup tables are missing.';
  END IF;

  -- Do not remove tables that now contain real records created after deploy.
  FOREACH table_name IN ARRAY ARRAY[
    'candidate_pre_employment_requests',
    'candidate_pre_employment_submissions',
    'candidate_references',
    'candidate_reference_form_requests',
    'candidate_reference_form_submissions',
    'candidate_employment_verifications',
    'candidate_employment_verification_form_requests',
    'candidate_employment_verification_form_submissions',
    'candidate_pre_employment_documents',
    'onboarding_sessions'
  ] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I', table_name) INTO new_onboarder_count;
      IF new_onboarder_count > 0 THEN
        RAISE EXCEPTION 'Rollback stopped: public.% contains % row(s). Restore from a reviewed backup/PITR instead.', table_name, new_onboarder_count;
      END IF;
    END IF;
  END LOOP;

  SELECT count(*) INTO new_onboarder_count
  FROM public.onboarders AS current_row
  LEFT JOIN migration_backups.reconcile_candidate_pre_employment_onboarders_before AS backup_row
    ON backup_row.onboarder_id = current_row.id
  WHERE backup_row.onboarder_id IS NULL;

  IF new_onboarder_count > 0 THEN
    RAISE EXCEPTION 'Rollback stopped: % onboarder row(s) were created after the preflight snapshot.', new_onboarder_count;
  END IF;

  SELECT bucket_existed INTO bucket_existed_before
  FROM migration_backups.reconcile_candidate_pre_employment_bucket_before
  WHERE singleton;

  IF NOT bucket_existed_before
     AND EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'candidate-pre-employment-docs') THEN
    RAISE EXCEPTION 'Rollback stopped: the new storage bucket contains files. Remove/archive them deliberately or restore from backup/PITR.';
  END IF;
END;
$$;

-- Restore statuses before reinstalling the staging-era status constraint.
DO $$
DECLARE
  status_constraint_name TEXT;
BEGIN
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
END;
$$;

UPDATE public.onboarders AS current_row
SET status = backup_row.status
FROM migration_backups.reconcile_candidate_pre_employment_onboarders_before AS backup_row
WHERE backup_row.onboarder_id = current_row.id;

ALTER TABLE public.onboarders
  ALTER COLUMN status SET DEFAULT 'offer_signed';

ALTER TABLE public.onboarders
  ADD CONSTRAINT onboarders_status_check
  CHECK (status IN (
    'offer_signed', 'background_check', 'pre_onboarding', 'day_one',
    'thirty_day', 'ninety_day', 'regularized', 'failed_probation', 'withdrew'
  ));

DROP TRIGGER IF EXISTS candidate_employment_verifications_after_bg_submission
  ON public.candidate_pre_employment_submissions;

DROP FUNCTION IF EXISTS public.record_candidate_employment_verification_form_submission(TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB);
DROP FUNCTION IF EXISTS public.record_candidate_reference_form_submission(TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB);
DROP FUNCTION IF EXISTS public.record_candidate_pre_employment_submission(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB);
DROP FUNCTION IF EXISTS public.sync_candidate_employment_verifications();

DROP TABLE IF EXISTS public.candidate_employment_verification_form_submissions;
DROP TABLE IF EXISTS public.candidate_employment_verification_form_requests;
DROP TABLE IF EXISTS public.candidate_reference_form_submissions;
DROP TABLE IF EXISTS public.candidate_reference_form_requests;
DROP TABLE IF EXISTS public.candidate_employment_verifications;
DROP TABLE IF EXISTS public.candidate_references;
DROP TABLE IF EXISTS public.candidate_pre_employment_documents;
DROP TABLE IF EXISTS public.candidate_pre_employment_submissions;
DROP TABLE IF EXISTS public.candidate_pre_employment_requests;

DROP INDEX IF EXISTS public.onboarders_direct_supervisor_id_idx;
DROP INDEX IF EXISTS public.onboarders_onboarding_form_token_hash_idx;
DROP INDEX IF EXISTS public.onboarders_onboarding_lead_id_idx;
DROP INDEX IF EXISTS public.onboarders_onboarding_session_id_idx;
DROP INDEX IF EXISTS public.onboarders_session_availability_idx;

ALTER TABLE public.onboarders
  DROP COLUMN IF EXISTS direct_supervisor_id,
  DROP COLUMN IF EXISTS meeting_availability_submitted_at,
  DROP COLUMN IF EXISTS meeting_availability,
  DROP COLUMN IF EXISTS onboarding_form_token_hash,
  DROP COLUMN IF EXISTS onboarding_lead_id,
  DROP COLUMN IF EXISTS onboarding_session_id;

DROP TABLE IF EXISTS public.onboarding_sessions;

DO $$
DECLARE
  bucket_before migration_backups.reconcile_candidate_pre_employment_bucket_before%ROWTYPE;
BEGIN
  SELECT * INTO bucket_before
  FROM migration_backups.reconcile_candidate_pre_employment_bucket_before
  WHERE singleton;

  IF bucket_before.bucket_existed THEN
    UPDATE storage.buckets
    SET public = bucket_before.is_public,
        file_size_limit = bucket_before.file_size_limit,
        allowed_mime_types = bucket_before.allowed_mime_types
    WHERE id = 'candidate-pre-employment-docs';
  ELSE
    DELETE FROM storage.buckets
    WHERE id = 'candidate-pre-employment-docs';
  END IF;
END;
$$;

COMMIT;

