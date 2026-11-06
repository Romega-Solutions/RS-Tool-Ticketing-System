-- Additive server-only credential metadata. Apply only after environment approval.
BEGIN;

DO $definition$
DECLARE definition text := $ddl$(
  id bigserial PRIMARY KEY,
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 200),
  key_prefix text NOT NULL UNIQUE CHECK (key_prefix ~ '^[A-Za-z0-9_-]{8}$'),
  key_hash text NOT NULL CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  scopes text[] NOT NULL DEFAULT ARRAY['tasks:read']::text[] CHECK (scopes = ARRAY['tasks:read']::text[]),
  project_ids integer[] NOT NULL DEFAULT '{}' CHECK (array_position(project_ids, NULL) IS NULL AND coalesce(array_ndims(project_ids), 1) = 1 AND 0 < ALL(project_ids)),
  rate_read_per_min integer NOT NULL DEFAULT 120 CHECK (rate_read_per_min > 0),
  created_by integer REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  revoked_at timestamptz,
  revoked_by integer REFERENCES public.users(id) ON DELETE SET NULL,
  revoke_reason text,
  rotated_from_id bigint REFERENCES public.api_keys(id) ON DELETE SET NULL
)$ddl$;
  live_constraints text[]; reference_constraints text[];
  live_defaults text[]; reference_defaults text[];
BEGIN
  EXECUTE 'CREATE TABLE IF NOT EXISTS public.api_keys ' || definition;
  EXECUTE 'CREATE TEMP TABLE expected_api_keys ' || regexp_replace(definition, ' REFERENCES public\.[a-z_]+\(id\) ON DELETE (SET NULL|CASCADE)', '', 'g') || ' ON COMMIT DROP';
  SELECT array_agg(pg_get_constraintdef(oid) ORDER BY pg_get_constraintdef(oid)) INTO live_constraints FROM pg_constraint WHERE conrelid = 'public.api_keys'::regclass AND contype <> 'f';
  SELECT array_agg(pg_get_constraintdef(oid) ORDER BY pg_get_constraintdef(oid)) INTO reference_constraints FROM pg_constraint WHERE conrelid = 'pg_temp.expected_api_keys'::regclass;
  SELECT array_agg(a.attname || ':' || regexp_replace(pg_get_expr(d.adbin,d.adrelid), 'nextval\(.*\)', 'sequence', 'g') ORDER BY a.attnum)
    INTO live_defaults FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.api_keys'::regclass;
  SELECT array_agg(a.attname || ':' || regexp_replace(pg_get_expr(d.adbin,d.adrelid), 'nextval\(.*\)', 'sequence', 'g') ORDER BY a.attnum)
    INTO reference_defaults FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='pg_temp.expected_api_keys'::regclass;
  IF live_constraints IS DISTINCT FROM reference_constraints OR live_defaults IS DISTINCT FROM reference_defaults THEN
    RAISE EXCEPTION 'Incompatible credential table constraints or defaults';
  END IF;
END $definition$;
DO $definition$
DECLARE definition text := $ddl$(
  id bigserial PRIMARY KEY,
  key_id bigint REFERENCES public.api_keys(id) ON DELETE SET NULL,
  key_prefix text,
  bot_label text,
  request_id text NOT NULL,
  method text NOT NULL,
  route text NOT NULL,
  task_id integer,
  status smallint NOT NULL,
  error_code text,
  duration_ms integer,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
)$ddl$;
  live_constraints text[]; reference_constraints text[];
  live_defaults text[]; reference_defaults text[];
BEGIN
  EXECUTE 'CREATE TABLE IF NOT EXISTS public.api_audit_log ' || definition;
  EXECUTE 'CREATE TEMP TABLE expected_api_audit_log ' || regexp_replace(definition, ' REFERENCES public\.[a-z_]+\(id\) ON DELETE (SET NULL|CASCADE)', '', 'g') || ' ON COMMIT DROP';
  SELECT array_agg(pg_get_constraintdef(oid) ORDER BY pg_get_constraintdef(oid)) INTO live_constraints FROM pg_constraint WHERE conrelid = 'public.api_audit_log'::regclass AND contype <> 'f';
  SELECT array_agg(pg_get_constraintdef(oid) ORDER BY pg_get_constraintdef(oid)) INTO reference_constraints FROM pg_constraint WHERE conrelid = 'pg_temp.expected_api_audit_log'::regclass;
  SELECT array_agg(a.attname || ':' || regexp_replace(pg_get_expr(d.adbin,d.adrelid), 'nextval\(.*\)', 'sequence', 'g') ORDER BY a.attnum)
    INTO live_defaults FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.api_audit_log'::regclass;
  SELECT array_agg(a.attname || ':' || regexp_replace(pg_get_expr(d.adbin,d.adrelid), 'nextval\(.*\)', 'sequence', 'g') ORDER BY a.attnum)
    INTO reference_defaults FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='pg_temp.expected_api_audit_log'::regclass;
  IF live_constraints IS DISTINCT FROM reference_constraints OR live_defaults IS DISTINCT FROM reference_defaults THEN
    RAISE EXCEPTION 'Incompatible credential table constraints or defaults';
  END IF;
END $definition$;
DO $definition$
DECLARE definition text := $ddl$(
  key_id bigint NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  bucket text NOT NULL CHECK (bucket = 'read:minute'),
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (key_id, bucket, window_start)
)$ddl$;
  live_constraints text[]; reference_constraints text[];
  live_defaults text[]; reference_defaults text[];
BEGIN
  EXECUTE 'CREATE TABLE IF NOT EXISTS public.api_rate_counters ' || definition;
  EXECUTE 'CREATE TEMP TABLE expected_api_rate_counters ' || regexp_replace(definition, ' REFERENCES public\.[a-z_]+\(id\) ON DELETE (SET NULL|CASCADE)', '', 'g') || ' ON COMMIT DROP';
  SELECT array_agg(pg_get_constraintdef(oid) ORDER BY pg_get_constraintdef(oid)) INTO live_constraints FROM pg_constraint WHERE conrelid = 'public.api_rate_counters'::regclass AND contype <> 'f';
  SELECT array_agg(pg_get_constraintdef(oid) ORDER BY pg_get_constraintdef(oid)) INTO reference_constraints FROM pg_constraint WHERE conrelid = 'pg_temp.expected_api_rate_counters'::regclass;
  SELECT array_agg(a.attname || ':' || regexp_replace(pg_get_expr(d.adbin,d.adrelid), 'nextval\(.*\)', 'sequence', 'g') ORDER BY a.attnum)
    INTO live_defaults FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.api_rate_counters'::regclass;
  SELECT array_agg(a.attname || ':' || regexp_replace(pg_get_expr(d.adbin,d.adrelid), 'nextval\(.*\)', 'sequence', 'g') ORDER BY a.attnum)
    INTO reference_defaults FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='pg_temp.expected_api_rate_counters'::regclass;
  IF live_constraints IS DISTINCT FROM reference_constraints OR live_defaults IS DISTINCT FROM reference_defaults THEN
    RAISE EXCEPTION 'Incompatible credential table constraints or defaults';
  END IF;
END $definition$;

-- Temporary reference tables cannot reference permanent tables. Check FKs separately.
DO $foreign_keys$
DECLARE spec record; actual text[];
BEGIN
  FOR spec IN SELECT * FROM (VALUES
    ('api_keys', ARRAY['created_by:users:n','revoked_by:users:n','rotated_from_id:api_keys:n']),
    ('api_audit_log', ARRAY['key_id:api_keys:n']),
    ('api_rate_counters', ARRAY['key_id:api_keys:c'])
  ) AS specs(tab, expected)
  LOOP
    SELECT array_agg(a.attname || ':' || f.relname || ':' || c.confdeltype::text ORDER BY a.attname)
      INTO actual FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
      JOIN pg_class f ON f.oid=c.confrelid
      JOIN pg_namespace n ON n.oid=f.relnamespace
      JOIN pg_attribute target ON target.attrelid=f.oid AND target.attnum=c.confkey[1]
      WHERE c.conrelid=('public.' || spec.tab)::regclass AND c.contype='f'
        AND cardinality(c.conkey)=1 AND cardinality(c.confkey)=1
        AND n.nspname='public' AND target.attname='id'
        AND NOT c.condeferrable AND c.confupdtype='a' AND c.confmatchtype='s' AND c.convalidated;
    IF actual IS DISTINCT FROM spec.expected OR
      (SELECT count(*) FROM pg_constraint WHERE conrelid=('public.' || spec.tab)::regclass AND contype='f') <> cardinality(spec.expected) THEN
      RAISE EXCEPTION 'Incompatible credential foreign keys';
    END IF;
  END LOOP;
END $foreign_keys$;

-- Refuse incompatible pre-existing tables rather than treating IF NOT EXISTS as validation.
DO $check$
DECLARE
  spec record;
  actual text;
BEGIN
  FOR spec IN SELECT * FROM (VALUES
    ('api_keys', 'id:bigint:false,label:text:false,key_prefix:text:false,key_hash:text:false,scopes:text[]:false,project_ids:integer[]:false,rate_read_per_min:integer:false,created_by:integer:true,created_at:timestamp with time zone:false,last_used_at:timestamp with time zone:true,expires_at:timestamp with time zone:false,revoked_at:timestamp with time zone:true,revoked_by:integer:true,revoke_reason:text:true,rotated_from_id:bigint:true'),
    ('api_audit_log', 'id:bigint:false,key_id:bigint:true,key_prefix:text:true,bot_label:text:true,request_id:text:false,method:text:false,route:text:false,task_id:integer:true,status:smallint:false,error_code:text:true,duration_ms:integer:true,ip:text:true,created_at:timestamp with time zone:false'),
    ('api_rate_counters', 'key_id:bigint:false,bucket:text:false,window_start:timestamp with time zone:false,count:integer:false')
  ) AS specs(tab, columns)
  LOOP
    SELECT string_agg(a.attname || ':' || format_type(a.atttypid,a.atttypmod) || ':' || (NOT a.attnotnull)::text, ',' ORDER BY a.attnum)
      INTO actual FROM pg_attribute a WHERE a.attrelid = ('public.' || spec.tab)::regclass AND a.attnum > 0 AND NOT a.attisdropped;
    IF actual IS DISTINCT FROM spec.columns THEN RAISE EXCEPTION 'Incompatible credential table structure'; END IF;
    IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = ('public.' || spec.tab)::regclass) THEN RAISE EXCEPTION 'Unexpected credential table policy'; END IF;
  END LOOP;
END $check$;

CREATE INDEX IF NOT EXISTS api_audit_log_created_idx ON public.api_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS api_audit_log_key_created_idx ON public.api_audit_log(key_id, created_at DESC);

DO $indexes$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='api_audit_log_created_idx' AND indexdef LIKE '%ON public.api_audit_log USING btree (created_at DESC)')
    OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='api_audit_log_key_created_idx' AND indexdef LIKE '%ON public.api_audit_log USING btree (key_id, created_at DESC)') THEN
    RAISE EXCEPTION 'Incompatible credential audit indexes';
  END IF;
END $indexes$;

CREATE OR REPLACE FUNCTION public.api_rate_hit(p_key bigint, p_bucket text, p_window timestamptz)
RETURNS integer LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog AS $rate$
  INSERT INTO public.api_rate_counters (key_id, bucket, window_start, count)
  VALUES (p_key, p_bucket, p_window, 1)
  ON CONFLICT (key_id, bucket, window_start)
  DO UPDATE SET count = public.api_rate_counters.count + 1
  RETURNING count;
$rate$;

-- A table trigger makes REST insertion and predecessor clamping one transaction.
-- This is internal lifecycle enforcement, not a key-management HTTP/RPC surface.
CREATE OR REPLACE FUNCTION public.api_key_lifecycle_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $lifecycle$
DECLARE predecessor public.api_keys%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.expires_at > OLD.expires_at
      OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL)
      OR NEW.key_hash IS DISTINCT FROM OLD.key_hash
      OR NEW.key_prefix IS DISTINCT FROM OLD.key_prefix
      OR NEW.rotated_from_id IS DISTINCT FROM OLD.rotated_from_id THEN
      RAISE EXCEPTION 'Credential lifecycle update forbidden';
    END IF;
    RETURN NEW;
  END IF;
  NEW.expires_at := now() + interval '90 days';
  NEW.created_at := now();
  IF NEW.rotated_from_id IS NOT NULL THEN
    SELECT * INTO predecessor FROM public.api_keys WHERE id = NEW.rotated_from_id FOR UPDATE;
    IF NOT FOUND OR predecessor.revoked_at IS NOT NULL OR predecessor.expires_at <= now()
      OR predecessor.scopes <> ARRAY['tasks:read']::text[] THEN
      RAISE EXCEPTION 'Predecessor unavailable';
    END IF;
    IF EXISTS (SELECT 1 FROM public.api_keys WHERE rotated_from_id = predecessor.id AND revoked_at IS NULL) THEN
      RAISE EXCEPTION 'Predecessor already has a live successor';
    END IF;
    NEW.scopes := ARRAY['tasks:read']::text[];
    NEW.project_ids := predecessor.project_ids;
    NEW.rate_read_per_min := predecessor.rate_read_per_min;
    NEW.label := predecessor.label;
    UPDATE public.api_keys SET expires_at = LEAST(expires_at, now() + interval '24 hours') WHERE id = predecessor.id;
  END IF;
  RETURN NEW;
END $lifecycle$;
DROP TRIGGER IF EXISTS api_key_lifecycle ON public.api_keys;
CREATE TRIGGER api_key_lifecycle BEFORE INSERT OR UPDATE ON public.api_keys FOR EACH ROW EXECUTE FUNCTION public.api_key_lifecycle_trigger();

-- Timestamp casts leave existing business-table storage and grants unchanged.
-- Include base FK columns so the REST schema cache can infer relationships.
CREATE OR REPLACE VIEW public.bot_api_work_items WITH (security_invoker = true) AS
  SELECT w.*, w.updated_at::timestamptz AS updated_at_ts FROM public.work_items w;
CREATE OR REPLACE VIEW public.bot_api_work_item_comments WITH (security_invoker = true) AS
  SELECT c.*, c.updated_at::timestamptz AS updated_at_ts FROM public.work_item_comments c;
CREATE OR REPLACE VIEW public.bot_api_work_item_activity WITH (security_invoker = true) AS
  SELECT a.*, a.created_at::timestamptz AS created_at_ts FROM public.work_item_activity a;
REVOKE ALL ON public.bot_api_work_items, public.bot_api_work_item_comments, public.bot_api_work_item_activity FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.bot_api_work_items, public.bot_api_work_item_comments, public.bot_api_work_item_activity TO service_role;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_keys, public.api_audit_log, public.api_rate_counters FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.api_keys_id_seq, public.api_audit_log_id_seq FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.api_rate_hit(bigint,text,timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.api_key_lifecycle_trigger() FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.api_keys TO service_role;
GRANT SELECT, INSERT, DELETE ON public.api_audit_log TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_rate_counters TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.api_keys_id_seq, public.api_audit_log_id_seq TO service_role;
GRANT EXECUTE ON FUNCTION public.api_rate_hit(bigint,text,timestamptz) TO service_role;

COMMIT;
