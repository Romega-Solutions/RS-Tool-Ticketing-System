-- Pre-check for drizzle/0020_candidates_active_application_uniq.sql. Read-only.
-- Lists open applications that share lower(btrim(email)) + lower(btrim(position)).
-- Must return 0 rows before the index is created; each row here would make
-- CREATE UNIQUE INDEX fail. Close or merge the extra rows first.
SELECT lower(btrim(email))    AS email_key,
       lower(btrim(position)) AS position_key,
       count(*)               AS open_rows,
       array_agg(id ORDER BY id) AS candidate_ids
FROM public.candidates
WHERE email IS NOT NULL
  AND position IS NOT NULL
  AND status NOT IN ('failed', 'no_show', 'unresponsive', 'withdrew', 'hired', 'consider_other')
GROUP BY 1, 2
HAVING count(*) > 1
ORDER BY open_rows DESC, email_key;
