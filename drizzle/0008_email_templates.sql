-- Account-setup email: an editable template + a per-user "sent" marker.
--
-- Hand-authored (schema.ts is drifted from the live DB, so `drizzle-kit generate`
-- is unsafe to blindly apply). Apply with the generic one-shot runner:
--   npx tsx --env-file=.env scripts/apply-migration.ts drizzle/0008_email_templates.sql
-- Re-runnable: the IF NOT EXISTS / ON CONFLICT guards make a second apply a no-op.

CREATE TABLE IF NOT EXISTS email_templates (
  key         text PRIMARY KEY,
  subject     text NOT NULL,
  body        text NOT NULL,
  updated_at  text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by  integer
);

-- Seed the single v1 row. Dollar-quoted so the apostrophes in the copy need no
-- escaping. Placeholders ({{first_name}}, {{login_link}}, {{email}}, {{guide_link}})
-- are resolved by src/lib/email-templates.ts at send time.
INSERT INTO email_templates (key, subject, body)
VALUES (
  'account_setup',
  $subj$Your RS Ticketing System account is ready, {{first_name}}$subj$,
  $body$Hi {{first_name}},

An account has been created for you on the RS Ticketing System — Romega's internal workspace for tasks, attendance, and weekly reports.

Getting in takes one click:

1. Open the sign-in page: {{login_link}}
2. Choose "Continue with Google".
3. Use this exact email address: {{email}}

Your role and details are already set up, so you'll land straight in your workspace.

Need a hand? See the quick guide at {{guide_link}}, or just reply to this email.

— The Romega Solutions team$body$
)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE users ADD COLUMN IF NOT EXISTS setup_email_sent_at text;
