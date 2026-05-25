-- Adds users.member_code — short identifier shown in attendance/payroll exports
-- and the admin user table. Referenced by:
--   src/app/api/admin/users/route.ts
--   src/app/api/attendance/route.ts
--   src/app/(app)/admin/users/page.tsx
--   src/app/(app)/attendance/attendance-client.tsx
-- The column was being selected before this migration existed, so the SELECTs
-- have been silently failing on any Supabase instance that hasn't had it
-- patched in by hand. Run this in Supabase → SQL Editor.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS member_code TEXT;
