-- WARNING: permanently loses credential, private audit and rate-counter data.
-- Never automatically run this against any shared environment.
BEGIN;
DROP FUNCTION IF EXISTS public.api_rate_hit(bigint,text,timestamptz);
DROP TABLE IF EXISTS public.api_rate_counters, public.api_audit_log, public.api_keys;
DROP FUNCTION IF EXISTS public.api_key_lifecycle_trigger();
COMMIT;
