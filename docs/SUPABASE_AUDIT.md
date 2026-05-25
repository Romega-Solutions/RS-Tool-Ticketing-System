# Supabase Schema Audit

A copy-paste health check for the live Supabase project behind RS-Tool-Ticketing-System. Use this whenever sign-in breaks mysteriously, after applying a migration, or before a release.

**How to run:** open the Supabase project → SQL Editor → New Query → paste each section → Run. Every block is read-only.

---

## 1. Tables the code expects to exist

Drop this in and look for any row where `present` is `false`. Each table is referenced from `src/` via `supabase.from('<table>')`.

```sql
with expected(name) as (
  values
    ('users'), ('timesheets'), ('weekly_reports'),
    ('candidates'), ('candidate_history'), ('positions'),
    ('leads'), ('briefings'), ('status_drafts'), ('content_drafts'),
    ('attendance'),
    ('projects'), ('project_states'), ('project_members'),
    ('cycles'), ('labels'),
    ('work_items'), ('work_item_assignees'), ('work_item_comments'),
    ('work_item_labels'), ('work_item_activity'),
    ('saved_views'),
    ('onboarders'), ('onboarder_documents'),
    ('onboarder_employment_verifications'),
    ('onboarder_history'), ('onboarder_references')
)
select e.name as table_name,
       (t.tablename is not null) as present
from expected e
left join pg_tables t
  on t.schemaname = 'public' and t.tablename = e.name
order by present asc, e.name;
```

---

## 2. Columns the code reads from `users`

`users` is the auth-critical table — a missing column here breaks every sign-in. If `present` is `false` for any row below, you have the same class of bug we hit on `is_onboarding`.

```sql
with expected(name, expected_type) as (
  values
    ('id',                       'integer'),
    ('username',                 'text'),
    ('password_hash',            'text'),
    ('name',                     'text'),
    ('email',                    'text'),
    ('role',                     'text'),
    ('team',                     'text'),
    ('job_title',                'text'),
    ('member_code',              'text'),
    ('hourly_rate_usd',          'numeric'),
    ('is_active',                'integer'),
    ('is_onboarding',            'integer'),
    ('reminder_enabled',         'integer'),
    ('reminder_interval_minutes','integer'),
    ('created_at',               'text'),
    ('updated_at',               'text')
)
select e.name as column_name,
       e.expected_type,
       c.data_type as actual_type,
       (c.column_name is not null) as present,
       case
         when c.column_name is null then 'MISSING'
         when c.data_type <> e.expected_type then 'TYPE_DRIFT'
         else 'ok'
       end as status
from expected e
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name   = 'users'
 and c.column_name  = e.name
order by status, e.name;
```

> **Note on type drift:** `text` vs `character varying` and `integer` vs `smallint` are both fine for our code. Flag only `MISSING` rows as bugs.

---

## 3. Row counts (sanity check)

Useful after a migration to confirm nothing was nuked. Empty tables are normal for fresh installs — only worry if a table that previously had data is suddenly zero.

```sql
select 'users'           as table_name, count(*) as rows from public.users
union all select 'timesheets',           count(*) from public.timesheets
union all select 'attendance',           count(*) from public.attendance
union all select 'projects',             count(*) from public.projects
union all select 'work_items',           count(*) from public.work_items
union all select 'work_item_assignees',  count(*) from public.work_item_assignees
union all select 'candidates',           count(*) from public.candidates
union all select 'onboarders',           count(*) from public.onboarders
union all select 'leads',                count(*) from public.leads
order by table_name;
```

---

## 4. Are there inactive or stuck-onboarding accounts?

If a user can't sign in, run this first.

```sql
select id, email, role, team, is_active, is_onboarding, updated_at
from public.users
where is_active = 0 or is_onboarding = 1
order by updated_at desc;
```

Re-activate with:
```sql
update public.users
set is_active = 1, updated_at = now()
where email = '<their-email>';
```

---

## 5. Supabase auth user without a `public.users` row

Anyone in this list signed in via Google/email but `auth/callback` failed to create their app row — they'll hit `/onboarding` on every visit.

```sql
select au.id, au.email, au.created_at, au.last_sign_in_at
from auth.users au
left join public.users pu on lower(pu.email) = lower(au.email)
where pu.id is null
order by au.last_sign_in_at desc nulls last;
```

---

## 6. Local helper script

`scripts/fix-my-account.ts` does the same probe from the terminal using `SUPABASE_SERVICE_ROLE_KEY` — handy when SQL Editor isn't open.

```bash
# Check
npx tsx scripts/fix-my-account.ts <email>

# Re-activate
npx tsx scripts/fix-my-account.ts <email> --activate
```

---

## When to re-run this audit

- After applying any `drizzle/*.sql` migration
- When sign-in starts redirecting to `/login?stale=1&reason=inactive` for users you didn't deactivate
- After merging a branch that changes `src/db/schema.ts`
- Before a production release that touches auth or onboarding

## Why this exists

On 2026-05-26, commit `10b7572` added `users.is_onboarding` reads to `src/lib/session.ts` but never shipped a migration. `getSession()` silently errored on every signed-in user, and `(app)/layout.tsx` misdiagnosed the null session as "your account is inactive." Fix shipped in commit `e03d29b`. This audit is the cheap way to catch the next one.
