create table impersonation_sessions (
  id bigint generated always as identity primary key,
  actor_admin_id uuid not null references auth.users(id),
  subject_user_id int4 not null references public.users(id),
  read_only boolean not null default true,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz
);

create index idx_impersonation_active
  on impersonation_sessions (actor_admin_id)
  where ended_at is null;

alter table impersonation_sessions enable row level security;
-- no policies — only the service-role client touches this table

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql as $$
declare
  claims jsonb := coalesce(event->'claims', '{}'::jsonb);
  active record;
  target record;
  active_found boolean;
  target_found boolean;
begin
  claims := jsonb_set(claims, '{ping}', '"pong"');
  claims := jsonb_set(claims, '{debug_user_id}', to_jsonb(event->>'user_id'));

  select * into active
  from public.impersonation_sessions
  where actor_admin_id = (event->>'user_id')::uuid
    and ended_at is null
    and expires_at > now()
  limit 1;
  active_found := found;
  claims := jsonb_set(claims, '{debug_active_found}', to_jsonb(active_found));
  claims := jsonb_set(claims, '{uuid}', to_jsonb((event->>'user_id')::uuid));
  claims := jsonb_set(claims, '{time_now}', to_jsonb(now()));

  if active_found then
    claims := jsonb_set(claims, '{debug_subject_user_id}', to_jsonb(active.subject_user_id::text));

    select * into target
    from public.users
    where id = active.subject_user_id;
    target_found := found;
    claims := jsonb_set(claims, '{debug_target_found}', to_jsonb(target_found));

    if target_found then
      claims := jsonb_set(claims, '{impersonating_subject}', to_jsonb(target.id::text));
      claims := jsonb_set(claims, '{effective_user}', to_jsonb(target));
    end if;
  end if;

  return jsonb_set(event, '{claims}', claims);
end; $$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

grant select on public.impersonation_sessions to supabase_auth_admin;
grant select on public.users to supabase_auth_admin;

-- create policy "Allow auth admin to read sessions" 
-- on public.impersonation_sessions
-- as permissive for select
-- to supabase_auth_admin
-- using (true);

-- create policy "Allow auth admin to read users" 
-- on public.users
-- as permissive for select
-- to supabase_auth_admin
-- using (true);
