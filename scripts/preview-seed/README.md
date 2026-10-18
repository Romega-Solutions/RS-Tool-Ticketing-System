# Preview seed

Fills a **non-production** Supabase project with fake data that copies the
shape of the live portal, and creates the five role test accounts used by the
preview role switcher (the "View as" dropdown on preview deployments).

Nothing personal is copied. The script reads only structure from the source:
roles, departments, who reports to whom, active/inactive, tool access,
projects, their board columns, how many tasks sit in each column, and who is
assigned to what. Everything else is made up:

| Data | On the preview database |
| --- | --- |
| Names, emails, usernames | Fake (e.g. `Avery Ashgrove`, `avery.ashgrove.0@preview.invalid`) |
| Birthdays, start/end dates, Drive links, Teams emails, member codes | Empty |
| Hourly rates | `9.99` for everyone, obviously fake |
| Bank / payment details, photos, candidates, onboarders | Not created |
| Project names, task names and text | Fake (`Sales Sample Project I`, `Sample task 3`), no descriptions |
| Attendance and timesheets | Made up for the last two full weeks |
| Positions | Fake titles, `Sample Client` |
| Auth accounts | Only the five role test accounts, no passwords |

## Role test accounts

| Role | Email | Notes |
| --- | --- | --- |
| Founder | `founder@preview.invalid` | Takes the real founder's place in the chain |
| Admin | `admin@preview.invalid` | Takes the first active admin's place |
| Lead | `lead@preview.invalid` | Takes the active lead with the most reports |
| IC | `ic@preview.invalid` | Reports to the lead |
| Intern | `intern@preview.invalid` | Reports to a fake senior IC who reports to the lead, so the lead's chain is two levels deep |

They have no password. The preview role switcher signs in as them with a
one-time link generated on the server, and only on a preview deployment.

## Safety rails

- Writing needs an explicit `--target <project-ref>`, and it must match
  `TARGET_SUPABASE_URL`.
- It refuses to write to production (`cqyzzgfpjtyujjotezij`), checked on the
  flag, the URL and a legacy JWT key.
- It refuses when the target is the same project as the source.
- It refuses a target that already has users who are not on
  `@preview.invalid`, unless you pass `--allow-other-users`.
- The source is only ever read with `select`.
- Re-runnable. Each run first removes only what the seed owns (users on
  `@preview.invalid` and rows linked to them, projects and positions whose
  description starts with `[preview-seed]`, auth accounts on
  `@preview.invalid`), then inserts everything again.
- Secrets come from environment variables only. Don't put them in files that
  get committed.

## Before the first run: catch the preview database up on migrations

rs-dev (`cgstmdpbzjuwwoudfeqk`) was created from a copy of the production
schema on 2026-10-15. It already matches `drizzle/0000` to `drizzle/0014`
(checked column by column against production). It is missing:

1. `drizzle/0015_projects_slug.sql`
2. `drizzle/0016_projects_slug_not_null.sql`

Run them in that order in the rs-dev SQL editor (Supabase dashboard, Romega
Dev org, rs-dev, SQL Editor). On an empty database both finish instantly.
The seed checks for `projects.slug` and stops if it's missing.

## Run it

```bash
# 1. Read-only structure source (production). Use the secret key from the
#    production project's API settings. It is only used for SELECTs.
export SOURCE_SUPABASE_URL=https://cqyzzgfpjtyujjotezij.supabase.co
export SOURCE_SUPABASE_SECRET_KEY=...        # never commit

# 2. Target: the preview database.
export TARGET_SUPABASE_URL=https://cgstmdpbzjuwwoudfeqk.supabase.co
export TARGET_SUPABASE_SECRET_KEY=...        # rs-dev secret key, never commit

# 3. See what would be created, write nothing.
npx tsx scripts/preview-seed/index.ts --dry-run

# 4. Seed.
npx tsx scripts/preview-seed/index.ts --target cgstmdpbzjuwwoudfeqk
```

To keep the production key and the preview key apart, you can split the run:

```bash
# With only the SOURCE_* vars set: save the anonymized structure.
npx tsx scripts/preview-seed/index.ts --structure-out scripts/preview-seed/structure.json

# Later, with only the TARGET_* vars set: seed from that file.
npx tsx scripts/preview-seed/index.ts --structure-in scripts/preview-seed/structure.json --target cgstmdpbzjuwwoudfeqk
```

`scripts/preview-seed/*.json` is git-ignored.

## Turning on the role switcher for previews

In Vercel → the portal project → Settings → Environment Variables, scoped to
**Preview only**:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://cgstmdpbzjuwwoudfeqk.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | rs-dev publishable key (Supabase → rs-dev → Project Settings → API Keys) |
| `SUPABASE_SECRET_KEY` | rs-dev secret key (same page) |
| `PREVIEW_ROLE_SWITCHER` | `true` |

Never add `PREVIEW_ROLE_SWITCHER` to Production. Even if it were added, the
switcher stays off unless `VERCEL_ENV` is `preview` and the Supabase project
is not production. Redeploy the preview after changing variables.
