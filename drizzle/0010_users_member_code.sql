-- Adds users.member_code — see docs/migrations/add-users-member-code.sql
-- for context. Apply manually via Supabase SQL Editor.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "member_code" text;
