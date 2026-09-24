# Test database migrations locally first

This is the full workflow for a teammate who does **not** already have a local
staging copy. The goal is:

```text
staging (read-only copy) -> your own Docker-local Supabase -> test migration -> review -> staging
```

Local changes never sync back automatically.

## 1. Make your own local copy of staging (one time)

You need Docker Desktop running and a staging database URL from an authorized
maintainer. Do not ask someone to send their password in chat; get your own
database password/connection URL from Supabase.

From the repository root:

```powershell
npx --yes supabase@latest init --workdir remote-staging-db
npx --yes supabase@latest start --workdir remote-staging-db
```

Create `remote-staging-db/.env` on **your own machine**:

```env
REMOTE_STAGING_DATABASE_URL=<your staging database URL>
```

This file is private. Do not commit it or paste its value in chat.

First export staging's schema into your local folder:

```powershell
$dbUrl = ((Get-Content remote-staging-db/.env | Where-Object { $_ -match '^REMOTE_STAGING_DATABASE_URL=' } | Select-Object -First 1) -replace '^REMOTE_STAGING_DATABASE_URL=', '')
npx --yes supabase@latest db dump --db-url $dbUrl -f remote-staging-db/schema.sql
```

If the migration needs real rows (for example, a backfill), get approval first,
then export the data too:

```powershell
npx --yes supabase@latest db dump --db-url $dbUrl --data-only --use-copy -f remote-staging-db/data.sql
```

Restore those files into Docker-local Postgres:

```powershell
Get-Content remote-staging-db/schema.sql -Raw |
  docker exec -i supabase_db_remote-staging-db psql -U postgres -d postgres --single-transaction --set ON_ERROR_STOP=1

if (Test-Path remote-staging-db/data.sql) {
  Get-Content remote-staging-db/data.sql -Raw |
    docker exec -i supabase_db_remote-staging-db psql -U postgres -d postgres --single-transaction --set ON_ERROR_STOP=1
}
```

Now open local Studio at http://127.0.0.1:54323. This is the teammate's own
copy, not a shared live database.

> The PostgreSQL dump does not copy Supabase Auth users or Storage files.

## 2. Point the app at the local copy (one time)

Create or update the root `.env.local` with the local Supabase URL, keys, and
database URL from:

```powershell
npx --yes supabase@latest status --workdir remote-staging-db -o env
```

Use the local values for:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
```

Do not replace the root `.env`; `.env.local` wins for local development only.

## 3. Test every migration locally

1. Add/review the SQL file in `docs/migrations/`.

2. Apply only that file to local Docker Postgres:

   ```powershell
   Get-Content docs/migrations/<your-migration>.sql -Raw |
     docker exec -i supabase_db_remote-staging-db psql -U postgres -d postgres --single-transaction --set ON_ERROR_STOP=1
   ```

3. Test the affected feature in the local app and local Studio.

4. Check what differs from staging:

   ```powershell
   $dbUrl = ((Get-Content remote-staging-db/.env | Where-Object { $_ -match '^REMOTE_STAGING_DATABASE_URL=' } | Select-Object -First 1) -replace '^REMOTE_STAGING_DATABASE_URL=', '')
   npx --yes supabase@latest db diff --workdir remote-staging-db --from local --to $dbUrl --schema public
   ```

5. Send the migration SQL and the diff to a reviewer. Only apply to staging
   after approval. Test staging before production.

## Important rules

- The SQL files in `docs/migrations/` are the current migration path. Do not
  run `drizzle-kit generate` or `drizzle-kit migrate` yet.
- Do **not** run the SQL printed by `db diff`. `--from local --to staging`
  shows how to undo local changes so local matches staging; it is for review.
- One change needs one canonical migration file. Do not keep two files that
  create the same table/column.
- Do not commit `.env`, `.env.local`, `remote-staging-db/.env`, database URLs,
  keys, schema dumps, or data dumps.
- A schema diff checks structure only. If the migration changes rows, check
  those rows locally too.
