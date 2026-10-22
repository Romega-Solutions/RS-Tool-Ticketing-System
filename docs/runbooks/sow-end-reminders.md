# SOW end-date reminders: runbook

Cron: `/api/cron/sow-end-reminders`, Mon–Fri 13:00 UTC (9 PM Manila).
Table: `public.sow_end_reminders` (`drizzle/0018_sow_end_reminders.sql`).

## Settings
- `SOW_ALERTS_MODE`: `log` (default) reports only, writes nothing; `send` records and emails; `off` does nothing.
- `SOW_ALERTS_START_DATE` (YYYY-MM-DD): milestones whose send date is before it never email.
  In `send` mode, if it is unset the cutoff is today, so turning sends on never backfills.
- `SOW_ALERTS_TO`: defaults to hr@romega-solutions.com.

## Known gap: rows stuck in `pending`
Each run first claims a milestone by inserting a `pending` row, then sends the
email, then updates the row to `sent` or `failed`. If the function crashes or
times out between the claim and the update, the row stays `pending`. The unique
key then blocks any later run from sending that milestone, and there is no
automatic retry yet. `failed` rows are not retried either.

Check (read-only):

```sql
select id, user_id, end_date, milestone_days, status, created_at, error
from public.sow_end_reminders
where status in ('pending', 'failed')
  and created_at < now() - interval '1 hour'
order by created_at;
```

If a row is stuck, first confirm in the sender's Gmail "Sent" folder whether the
email went out. If it did, mark the row `sent`; if not, email HR by hand (or,
with approval, delete the row so the next run retries while the milestone is
still current). Any write on prod needs Duane's OK.

## Launch note

In `send` mode with `SOW_ALERTS_START_DATE` unset, the cutoff is "today", so a missed weekday run will not catch up. At launch, set `SOW_ALERTS_START_DATE` to the launch day: that blocks backfill and keeps missed-day catch-up working.
