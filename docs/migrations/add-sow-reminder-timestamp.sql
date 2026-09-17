-- Run after reconcile-candidate-pre-employment.sql, before deploying SOW reminders.
ALTER TABLE public.candidate_pre_employment_documents
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMPTZ;
