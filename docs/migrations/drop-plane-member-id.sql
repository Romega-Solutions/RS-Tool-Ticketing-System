-- Completely remove all Plane Member ID columns.
-- Run this in Supabase → SQL Editor → New query. Safe to re-run.
--
-- Prerequisites:
--   1. docs/migrations/add-pm-phase1.sql has already been applied
--      (this is what added work_item_assignees.user_id with the backfill).
--   2. The app has been redeployed with the planeMemberId-stripped code.
--      Running this BEFORE the code deploy will 500 every page that
--      still selects plane_member_id from users.
--
-- What this does:
--   1. Backfills any remaining work_item_assignees.user_id from member_key
--      so we don't lose assignment data when member_key is dropped.
--   2. Deletes orphan rows that still can't resolve to a real user.
--   3. Promotes work_item_assignees.user_id to NOT NULL.
--   4. DROPS users.plane_member_id.
--   5. DROPS work_item_assignees.member_key.

------------------------------------------------------------------------------
-- 1. Final backfill: copy plane_member_id → user_id for any rows that
--    haven't been mapped yet. This is a no-op if Phase 1's backfill already
--    covered everything.
------------------------------------------------------------------------------
UPDATE work_item_assignees AS wia
SET    user_id = u.id
FROM   users AS u
WHERE  wia.user_id IS NULL
  AND  u.plane_member_id IS NOT NULL
  AND  u.plane_member_id = wia.member_key;

------------------------------------------------------------------------------
-- 2. Delete any assignee rows that STILL can't be resolved to a user
--    (e.g. legacy Plane UUIDs for people who never existed in this app).
--    Without this, the NOT NULL in step 3 would fail.
------------------------------------------------------------------------------
DELETE FROM work_item_assignees WHERE user_id IS NULL;

------------------------------------------------------------------------------
-- 3. Tighten user_id to NOT NULL — it's now the real source of truth.
------------------------------------------------------------------------------
ALTER TABLE work_item_assignees
  ALTER COLUMN user_id SET NOT NULL;

------------------------------------------------------------------------------
-- 4. Drop plane_member_id from users.
------------------------------------------------------------------------------
ALTER TABLE users
  DROP COLUMN IF EXISTS plane_member_id;

------------------------------------------------------------------------------
-- 5. Drop member_key from work_item_assignees (legacy mirror of plane id).
------------------------------------------------------------------------------
ALTER TABLE work_item_assignees
  DROP COLUMN IF EXISTS member_key;

------------------------------------------------------------------------------
-- Verification (optional — uncomment to run after the drops).
------------------------------------------------------------------------------
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'users' AND column_name = 'plane_member_id';
-- -- (should return 0 rows)
--
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'work_item_assignees' AND column_name = 'member_key';
-- -- (should return 0 rows)
--
-- SELECT count(*) AS unresolved FROM work_item_assignees WHERE user_id IS NULL;
-- -- (should return 0)
