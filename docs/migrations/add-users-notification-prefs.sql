-- Per-user notification EMAIL preferences (the in-app bell is always on; these
-- toggles gate email delivery only). `email` is the master switch; the rest are
-- per-event. Default everything ON so existing users keep receiving emails.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL
  DEFAULT '{"email":true,"mentions":true,"dueToday":true,"approvals":true,"projectAdded":true,"taskAdded":true}'::jsonb;
