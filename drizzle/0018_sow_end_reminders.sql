-- SOW end-date alerts: one row per (user, end_date, milestone) so each
-- 75/60/45-day reminder goes out at most once. The unique key includes
-- end_date, so changing a user's end date starts a fresh schedule while the
-- old rows stay as history.
--
--   status   'pending' (claimed, send in flight) | 'sent' | 'failed' |
--            'skipped' (an older milestone superseded on the same run)
--   sent_at  when n8n accepted the email
--   error    the send error for 'failed' rows (no secrets, no bodies)
--
-- Only the cron (service_role, via the admin client) touches this table. RLS is
-- on with no policies, so anon/authenticated get nothing.
--
-- Hand-authored. Additive and idempotent: safe to run more than once.
-- Undo:       docs/migrations/0018-sow-end-reminders-rollback.sql
-- Apply with:
--   npx tsx --env-file=.env scripts/apply-migration.ts drizzle/0018_sow_end_reminders.sql

CREATE TABLE IF NOT EXISTS public.sow_end_reminders (
  id             serial PRIMARY KEY,
  user_id        integer     NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  end_date       text        NOT NULL,
  milestone_days smallint    NOT NULL,
  sent_at        timestamptz,
  status         text        NOT NULL DEFAULT 'pending',
  error          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sow_end_reminders_user_end_milestone_key UNIQUE (user_id, end_date, milestone_days),
  CONSTRAINT sow_end_reminders_milestone_check CHECK (milestone_days IN (75, 60, 45)),
  CONSTRAINT sow_end_reminders_status_check CHECK (status IN ('pending', 'sent', 'failed', 'skipped'))
);

CREATE INDEX IF NOT EXISTS sow_end_reminders_user_idx
  ON public.sow_end_reminders USING btree (user_id);

ALTER TABLE public.sow_end_reminders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.sow_end_reminders FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.sow_end_reminders_id_seq FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sow_end_reminders TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.sow_end_reminders_id_seq TO service_role;
