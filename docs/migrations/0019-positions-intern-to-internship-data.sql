-- PROD DATA UPDATE (prepared, NOT run). Needs Duane's explicit OK for each env.
-- Order: after 0019 is applied on prod and the portal deploy, before the website deploy.
-- Sets the 9 intern posts to 'internship' BY ID ONLY. Do not match on title:
-- id 4 "Manager – International Business Development" contains "Intern" but is
-- not an intern post and is deliberately excluded.
--
-- Expected before (prod, checked Oct 22, 2026, 11:30 PM Manila):
--   id 1  AI Automation Intern (n8n)                          full_time  closed
--   id 2  SDR Intern                                          full_time  closed
--   id 6  Content Producer Intern                             part_time  closed
--   id 7  Human Resources Intern                              part_time  closed
--   id 8  Human Resources Intern                              part_time  open
--   id 9  Full-stack Developer Intern — Mobile Dating App     part_time  closed
--   id 10 Full-stack Developer Intern — Mobile Dating App     part_time  closed
--   id 11 Front-End Developer Intern                          part_time  open
--   id 12 Full-Stack Developer Intern                         part_time  open
-- Open question: ids 1 and 2 were full_time. Drop them from the lists below if
-- Duane says "only 6–12".

-- ── 1. BACKUP / VERIFY (read-only). Save this output before step 2. ──────────
SELECT id, job_title, employment_type, is_open, updated_at
FROM public.positions
WHERE id IN (1, 2, 4, 6, 7, 8, 9, 10, 11, 12)
ORDER BY id;
-- Expect 10 rows; id 4 is shown only to confirm it is NOT touched.

-- ── 2. UPDATE (one transaction; aborts unless exactly the expected rows match) ─
BEGIN;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.positions
   WHERE (id IN (1, 2)                    AND employment_type = 'full_time')
      OR (id IN (6, 7, 8, 9, 10, 11, 12)  AND employment_type = 'part_time');
  IF n <> 9 THEN
    RAISE EXCEPTION 'Expected 9 rows in their recorded state, found %. Aborting.', n;
  END IF;
END $$;

UPDATE public.positions
   SET employment_type = 'internship', updated_at = now()
 WHERE id IN (1, 2, 6, 7, 8, 9, 10, 11, 12);
-- Expect: UPDATE 9

-- Verify inside the transaction, then COMMIT (or ROLLBACK if anything is off).
SELECT id, job_title, employment_type FROM public.positions
WHERE id IN (1, 2, 4, 6, 7, 8, 9, 10, 11, 12) ORDER BY id;
-- Expect ids 1,2,6–12 = internship; id 4 unchanged.

COMMIT;

-- ── 3. ROLLBACK (only if needed; restores the recorded values) ────────────────
-- BEGIN;
-- UPDATE public.positions SET employment_type = 'full_time', updated_at = now() WHERE id IN (1, 2);
-- UPDATE public.positions SET employment_type = 'part_time', updated_at = now() WHERE id IN (6, 7, 8, 9, 10, 11, 12);
-- -- Expect UPDATE 2 and UPDATE 7. To also restore updated_at, use the values saved in step 1.
-- COMMIT;
