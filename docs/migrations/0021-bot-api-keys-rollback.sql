-- WARNING: permanently loses credential, private audit and rate-counter data.
-- Drops three read views, two functions (including the insert/update guard), and three tables.
-- Never automatically run this against any shared environment.
BEGIN;
DROP VIEW IF EXISTS public.bot_api_work_items, public.bot_api_work_item_comments, public.bot_api_work_item_activity;
DROP FUNCTION IF EXISTS public.api_rate_hit(bigint,text,timestamptz);
DROP TABLE IF EXISTS public.api_rate_counters, public.api_audit_log, public.api_keys;
DROP FUNCTION IF EXISTS public.api_key_lifecycle_trigger();
COMMIT;
