-- Adds users.is_onboarding — referenced by src/lib/session.ts and the
-- onboarding-intake pages since commit 10b7572 but never migrated.
-- Without this column, every getSession() call errors and signed-in users
-- get bounced to /login?stale=1&reason=inactive. Apply via Supabase SQL Editor.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_onboarding" integer NOT NULL DEFAULT 0;
