-- =====================================================================
-- enable-rls-all-public-tables.sql                       2026-07-01
-- Closes the CRITICAL "RLS Disabled in Public" advisor findings.
--
-- CONTEXT / WHY THIS IS SAFE FOR THIS APP
--   The public anon key ships in the browser bundle, so PostgREST
--   (https://<ref>.supabase.co/rest/v1/<table>) is reachable by anyone
--   on the internet. With RLS disabled + Supabase's default grants, that
--   means every public table was world-readable AND world-writable.
--   (Verified 2026-07-01: anonymous GET/PATCH/DELETE on candidates,
--   onboarders, notifications, etc. all returned 2xx with the anon key.)
--
--   This app does NOT rely on the anon/authenticated PostgREST data API:
--     * ~89 callsites use the service-role admin client (createAdminClient)
--       -> BYPASSES RLS.
--     * Drizzle queries use DATABASE_URL as the postgres owner role
--       -> BYPASSES RLS.
--     * The anon/authenticated Supabase client is used only for AUTH and
--       one Realtime subscription on public.users (already RLS-enabled and
--       intentionally left untouched below).
--   Enabling RLS therefore closes the public hole with ZERO app changes.
--
-- REVERSIBLE: ALTER TABLE public.<t> DISABLE ROW LEVEL SECURITY;
-- =====================================================================

-- 1) Enable RLS on every public table that currently has it disabled.
--    No policies are added: anon/authenticated get zero PostgREST access,
--    while service_role and the table owner continue to bypass RLS.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND rowsecurity = false
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
    RAISE NOTICE 'RLS enabled on public.%', r.tablename;
  END LOOP;
END $$;

-- 2) Stop anonymous + signed-in users from executing the SECURITY DEFINER
--    serial function. The app calls it via the service role, which keeps
--    EXECUTE, so certificate minting is unaffected.
REVOKE EXECUTE ON FUNCTION public.nextval_lms_certificate_serial()
  FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- VERIFY (should return zero rows = nothing left unprotected):
--   SELECT tablename FROM pg_tables
--   WHERE schemaname = 'public' AND rowsecurity = false;
-- ---------------------------------------------------------------------

-- =====================================================================
-- FOLLOW-UPS (handled separately — NOT auto-run here):
--
--  a) "Function Search Path Mutable" — public.mint_application_code:
--       pin a fixed search_path. Use a value that keeps the body working
--       (it references public objects unqualified), e.g.:
--         ALTER FUNCTION public.mint_application_code(...args...)
--           SET search_path = public, pg_temp;
--       (run \df+ mint_application_code first to get the exact signature)
--
--  b) "Leaked Password Protection Disabled" (Auth) — dashboard toggle:
--       Authentication -> Policies/Passwords -> enable HaveIBeenPwned check.
--       Low impact: this app is Google-only login.
--
--  c) Unindexed foreign keys / Unused indexes (PERFORMANCE, not security):
--       Safe to defer. Trivial dataset on the nano tier; revisit if/when
--       these tables grow. Add covering indexes on the FK columns the
--       advisor lists, and drop the unused indexes after confirming no
--       planned query needs them.
-- =====================================================================
