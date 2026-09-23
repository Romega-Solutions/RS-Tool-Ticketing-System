-- Atomic per-day attendance save: sets ONE day's status column on `attendance`
-- plus the FULL replacement set of that day's `timesheets` sessions, in one
-- transaction — a Postgres function body is one implicit transaction, so this
-- is the mechanism that gives PATCH /api/admin/attendance/day real atomicity
-- while the app talks to Postgres only through the service-role PostgREST
-- client (supabase-js), never a direct DATABASE_URL connection.
--
-- Sessions are keyed to their clock-in date — this only ever touches
-- `timesheets` rows whose `date` = p_date. Anything not present in
-- p_sessions is deleted; callers send the day's full desired session list,
-- not a diff.
--
-- Hard rule enforced here (not just client-side): a non-workable status
-- (absent/leave) with a non-empty p_sessions is rejected outright — this is
-- the actual fix for the bug where a day with no workable status could still
-- carry timesheet sessions.
--
-- The file also locks EXECUTE down to service_role and ends with a one-time,
-- idempotent backfill re-keying timesheets.date to PHT (see bottom).
--
-- p_sessions shape: jsonb array of { "id": int|null, "clockedInAt": ISO text,
-- "clockedOutAt": ISO text | null }.
CREATE OR REPLACE FUNCTION save_attendance_day(
  p_user_id     integer,
  p_week_start  text,
  p_date        text,
  p_status      text,
  p_sessions    jsonb,
  p_edited_by   integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day_names       text[] := array['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  v_status          text := lower(p_status);
  v_workable        boolean;
  v_day_column      text;
  v_now             text := to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_existing_ids    integer[];
  v_submitted_ids   integer[];
  v_base_seconds    integer;
  v_week_dates      text[];
  v_attendance_id   integer;
  v_other_column    text;
  v_other_week_start text;
  v_other_status    text;
  v_other_dow       integer;
  r                 record;
  v_duration        integer;
  v_week_before     integer;
  v_ot_seconds      integer;
  v_is_ot           integer;
  v_batch_before    integer := 0;
BEGIN
  IF v_status IS NULL OR NOT (v_status = ANY (ARRAY['present','wfh','absent','leave'])) THEN
    RAISE EXCEPTION 'status must be one of present, wfh, absent, leave';
  END IF;
  v_workable := v_status IN ('present', 'wfh');

  -- Materialize the submitted sessions once into a typed temp table so every
  -- check below is plain SQL instead of repeated jsonb parsing.
  CREATE TEMPORARY TABLE IF NOT EXISTS tmp_attendance_day_sessions (
    ord            serial,
    id             integer,
    clocked_in_at  text,
    clocked_out_at text,
    in_ts          timestamptz,
    out_ts         timestamptz
  ) ON COMMIT DROP;
  TRUNCATE tmp_attendance_day_sessions;

  INSERT INTO tmp_attendance_day_sessions (id, clocked_in_at, clocked_out_at, in_ts, out_ts)
  SELECT
    NULLIF(elem->>'id', '')::integer,
    elem->>'clockedInAt',
    elem->>'clockedOutAt',
    (elem->>'clockedInAt')::timestamptz,
    NULLIF(elem->>'clockedOutAt', '')::timestamptz
  FROM jsonb_array_elements(COALESCE(p_sessions, '[]'::jsonb)) AS elem;

  IF NOT v_workable AND EXISTS (SELECT 1 FROM tmp_attendance_day_sessions) THEN
    RAISE EXCEPTION '% days can''t have clock-in/out sessions — remove them first.',
      (CASE WHEN v_status = 'absent' THEN 'Absent' ELSE 'Leave' END);
  END IF;

  IF EXISTS (SELECT 1 FROM tmp_attendance_day_sessions WHERE in_ts IS NULL) THEN
    RAISE EXCEPTION 'Clock-in time is required for every session.';
  END IF;
  IF EXISTS (SELECT 1 FROM tmp_attendance_day_sessions WHERE out_ts IS NOT NULL AND out_ts <= in_ts) THEN
    RAISE EXCEPTION 'Clock-out must be after clock-in.';
  END IF;
  -- Attendance days are anchored to PHT (Asia/Manila, UTC+8, no DST — the
  -- app's operating timezone, see src/lib/briefing.ts). Casting a timestamptz
  -- straight to ::date uses the session's timezone GUC (UTC on Supabase by
  -- default), so 8:00 AM PHT — exactly UTC midnight — would otherwise put any
  -- earlier PHT clock-in on the *previous* UTC calendar date and wrongly trip
  -- this check.
  IF EXISTS (SELECT 1 FROM tmp_attendance_day_sessions WHERE (in_ts AT TIME ZONE 'Asia/Manila')::date <> p_date::date) THEN
    RAISE EXCEPTION 'A session must start on the day you''re editing.';
  END IF;

  -- No two of this day's submitted sessions may overlap each other.
  IF EXISTS (
    SELECT 1
    FROM tmp_attendance_day_sessions a
    JOIN tmp_attendance_day_sessions b ON a.ord < b.ord
    WHERE a.in_ts < COALESCE(b.out_ts, 'infinity'::timestamptz)
      AND b.in_ts < COALESCE(a.out_ts, 'infinity'::timestamptz)
  ) THEN
    RAISE EXCEPTION 'Two sessions on this day overlap in time.';
  END IF;

  SELECT array_agg(id) INTO v_existing_ids
  FROM timesheets WHERE user_id = p_user_id AND date = p_date;
  SELECT array_agg(id) INTO v_submitted_ids
  FROM tmp_attendance_day_sessions WHERE id IS NOT NULL;

  -- Every submitted id must be one of THIS user's sessions on THIS day. Anything
  -- else is a stale modal (the row was deleted or moved since it was opened) or a
  -- forged payload — updating it would silently no-op or rewrite someone else's
  -- row, so refuse the whole save.
  IF EXISTS (
    SELECT 1 FROM tmp_attendance_day_sessions
    WHERE id IS NOT NULL AND id <> ALL (COALESCE(v_existing_ids, ARRAY[]::integer[]))
  ) THEN
    RAISE EXCEPTION 'This day''s sessions changed since you opened it — reload and try again.';
  END IF;

  -- Overlap against sessions NOT part of this day's edit batch (adjacent-day
  -- sessions that cross into/out of this date).
  IF EXISTS (
    SELECT 1
    FROM timesheets t, tmp_attendance_day_sessions s
    WHERE t.user_id = p_user_id
      AND t.date::date BETWEEN (p_date::date - 1) AND (p_date::date + 1)
      AND t.id <> ALL (COALESCE(v_existing_ids, ARRAY[]::integer[]))
      AND s.in_ts < COALESCE(t.clocked_out_at::timestamptz, 'infinity'::timestamptz)
      AND t.clocked_in_at::timestamptz < COALESCE(s.out_ts, 'infinity'::timestamptz)
  ) THEN
    RAISE EXCEPTION 'This overlaps another clock-in/out session for this user.';
  END IF;

  -- A session that crosses into an adjacent day can't land on one tagged
  -- Absent/Leave (the day being edited here is governed by p_status above).
  FOR r IN
    SELECT DISTINCT d::date AS dt
    FROM tmp_attendance_day_sessions s,
         generate_series(
           (s.in_ts AT TIME ZONE 'Asia/Manila')::date,
           (COALESCE(s.out_ts, s.in_ts) AT TIME ZONE 'Asia/Manila')::date,
           interval '1 day'
         ) d
    WHERE d::date <> p_date::date
  LOOP
    v_other_dow := extract(dow FROM r.dt)::integer;
    v_other_week_start := to_char(
      CASE WHEN v_other_dow = 0 THEN r.dt - 6 ELSE r.dt - (v_other_dow - 1) END,
      'YYYY-MM-DD'
    );
    v_other_column := v_day_names[v_other_dow + 1] || '_status';

    EXECUTE format('SELECT %I FROM attendance WHERE user_id = $1 AND week_start = $2', v_other_column)
      INTO v_other_status USING p_user_id, v_other_week_start;

    IF v_other_status IN ('absent', 'leave') THEN
      RAISE EXCEPTION '% is tagged % — that session can''t cross into it.',
        to_char(r.dt, 'Mon FMDD'), (CASE WHEN v_other_status = 'absent' THEN 'Absent' ELSE 'Leave' END);
    END IF;
  END LOOP;

  -- Delete sessions dropped from this day's list.
  DELETE FROM timesheets
  WHERE user_id = p_user_id AND date = p_date
    AND id <> ALL (COALESCE(v_submitted_ids, ARRAY[]::integer[]));

  -- Insert/update sessions in chronological order so weekly-overtime math
  -- accumulates this day's earlier sessions (v_batch_before).
  SELECT (approved_hours_per_week * 3600) INTO v_base_seconds FROM users WHERE id = p_user_id;
  v_base_seconds := COALESCE(v_base_seconds, 15 * 3600);
  SELECT array_agg(to_char(d, 'YYYY-MM-DD')) INTO v_week_dates
  FROM generate_series(p_week_start::date, p_week_start::date + 6, interval '1 day') d;

  FOR r IN SELECT * FROM tmp_attendance_day_sessions ORDER BY in_ts LOOP
    v_duration := NULL; v_is_ot := 0; v_ot_seconds := NULL;

    IF r.out_ts IS NOT NULL THEN
      v_duration := round(extract(epoch FROM (r.out_ts - r.in_ts)))::integer;

      -- Weekly total BEFORE this session: completed sessions on other days of
      -- the week that started earlier, plus this day's earlier sessions from
      -- this batch (this day's stored rows are mid-rewrite, so they're excluded
      -- and the batch's own running total is used instead).
      SELECT COALESCE(sum(duration_seconds), 0) + v_batch_before INTO v_week_before
      FROM timesheets
      WHERE user_id = p_user_id
        AND date = ANY (v_week_dates)
        AND date <> p_date
        AND duration_seconds IS NOT NULL
        AND clocked_in_at::timestamptz < r.in_ts;

      v_ot_seconds := greatest(0, least(v_duration, v_week_before + v_duration - v_base_seconds));
      IF v_ot_seconds > 0 THEN v_is_ot := 1; ELSE v_ot_seconds := NULL; END IF;
      v_batch_before := v_batch_before + v_duration;
    END IF;

    IF r.id IS NOT NULL THEN
      UPDATE timesheets SET
        clocked_in_at = r.clocked_in_at,
        clocked_out_at = r.clocked_out_at,
        date = p_date,
        duration_seconds = v_duration,
        is_overtime = v_is_ot,
        overtime_seconds = v_ot_seconds,
        edited_by = p_edited_by,
        edited_at = v_now
      WHERE id = r.id AND user_id = p_user_id AND date = p_date;
    ELSE
      INSERT INTO timesheets (user_id, clocked_in_at, clocked_out_at, date, duration_seconds, is_overtime, overtime_seconds, edited_by, edited_at)
      VALUES (p_user_id, r.clocked_in_at, r.clocked_out_at, p_date, v_duration, v_is_ot, v_ot_seconds, p_edited_by, v_now);
    END IF;
  END LOOP;

  -- Upsert just this one day's status column on the week's attendance row —
  -- every other day column (and notes) is left untouched.
  v_day_column := v_day_names[extract(dow FROM p_date::date)::integer + 1] || '_status';
  SELECT id INTO v_attendance_id FROM attendance WHERE user_id = p_user_id AND week_start = p_week_start;

  IF v_attendance_id IS NOT NULL THEN
    EXECUTE format('UPDATE attendance SET %I = $1, edited_by = $2, edited_at = $3, submitted_at = $3 WHERE id = $4', v_day_column)
      USING v_status, p_edited_by, v_now, v_attendance_id;
  ELSE
    EXECUTE format('INSERT INTO attendance (user_id, week_start, %I, submitted_at, edited_by, edited_at) VALUES ($1, $2, $3, $4, $5, $4)', v_day_column)
      USING p_user_id, p_week_start, v_status, v_now, p_edited_by;
  END IF;
END;
$$;

-- SECURITY DEFINER + Postgres's default EXECUTE-to-PUBLIC grant (and Supabase's
-- default grants to anon/authenticated) would expose this through PostgREST at
-- /rest/v1/rpc/save_attendance_day to anyone holding the publishable key,
-- bypassing the route's requireAdmin(). Only the service-role client used by
-- PATCH /api/admin/attendance/day may call it.
REVOKE EXECUTE ON FUNCTION save_attendance_day(integer, text, text, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION save_attendance_day(integer, text, text, text, jsonb, integer) TO service_role;

-- ─── One-time backfill: re-key timesheets.date to the PHT calendar date ──────
-- Clock-in used to stamp `date` from the server clock (UTC on Vercel), whose day
-- flips at 8:00 AM PHT, so every clock-in before 8 AM PHT was filed under the
-- previous day. The app now derives it in PHT (src/lib/pht.ts); this re-dates
-- the existing rows to match. Idempotent — a second run matches no rows and so
-- changes nothing.
--
-- Session times and durations are untouched; only the day (and, for a Monday
-- before 8 AM, the Mon–Sun week) a session counts toward changes. Therefore:
--   * The same bug made clock-in auto-mark the wrong weekday Present, so each
--     re-dated session's real weekday is marked Present when it has no status
--     yet (existing statuses are never overwritten, and the old day's status is
--     left alone since it may be legitimately set).
--   * Weekly overtime is recomputed for every (user, week) a re-dated session
--     left or joined, using the same rule as clock-out and save_attendance_day:
--     a completed session's overtime is the slice beyond the user's
--     approved_hours_per_week base (default 15h), counting the completed
--     sessions that started before it that Mon–Sun week.
DO $$
DECLARE
  v_day_names text[] := array['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  r           record;
  v_dow       integer;
  v_col       text;
  v_week      text;
BEGIN
  CREATE TEMPORARY TABLE IF NOT EXISTS tmp_pht_redated (
    user_id  integer,
    old_date text,
    new_date text
  ) ON COMMIT DROP;
  TRUNCATE tmp_pht_redated;

  WITH stale AS (
    SELECT id, date AS old_date
    FROM timesheets
    WHERE date <> to_char((clocked_in_at::timestamptz AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD')
  ), redated AS (
    UPDATE timesheets t
    SET date = to_char((t.clocked_in_at::timestamptz AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD')
    FROM stale
    WHERE t.id = stale.id
    RETURNING t.user_id, stale.old_date, t.date AS new_date
  )
  INSERT INTO tmp_pht_redated SELECT user_id, old_date, new_date FROM redated;

  -- Mark each re-dated session's real weekday Present where it has no status.
  FOR r IN SELECT DISTINCT user_id, new_date FROM tmp_pht_redated LOOP
    v_dow := extract(dow FROM r.new_date::date)::integer;
    CONTINUE WHEN v_dow IN (0, 6);  -- clock-in never auto-marks weekends
    v_col  := v_day_names[v_dow + 1] || '_status';
    v_week := to_char(r.new_date::date - (v_dow - 1), 'YYYY-MM-DD');
    EXECUTE format(
      'INSERT INTO attendance (user_id, week_start, %1$I) VALUES ($1, $2, ''present'')
       ON CONFLICT (user_id, week_start) DO UPDATE SET %1$I = ''present''
       WHERE attendance.%1$I IS NULL', v_col)
    USING r.user_id, v_week;
  END LOOP;

  -- Recompute overtime for every (user, Mon–Sun week) a re-dated session left or
  -- joined. Monday of a date = date - ((ISO dow) - 1), ISO dow Mon=1 … Sun=7.
  WITH touched AS (
    SELECT DISTINCT user_id, (d::date - (extract(isodow FROM d::date)::integer - 1)) AS week_start
    FROM tmp_pht_redated, LATERAL (VALUES (old_date), (new_date)) v(d)
  ), sessions AS (
    SELECT t.id,
           t.duration_seconds AS dur,
           COALESCE(u.approved_hours_per_week, 15) * 3600 AS base,
           COALESCE(sum(t.duration_seconds) OVER (
             PARTITION BY t.user_id, w.week_start
             ORDER BY t.clocked_in_at::timestamptz, t.id
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
           ), 0) AS before
    FROM timesheets t
    JOIN touched w
      ON w.user_id = t.user_id
     AND t.date::date BETWEEN w.week_start AND w.week_start + 6
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.duration_seconds IS NOT NULL
  ), recalc AS (
    SELECT id, greatest(0, least(dur, before + dur - base)) AS ot
    FROM sessions
  )
  UPDATE timesheets t
  SET is_overtime      = CASE WHEN recalc.ot > 0 THEN 1 ELSE 0 END,
      overtime_seconds = CASE WHEN recalc.ot > 0 THEN recalc.ot END
  FROM recalc
  WHERE t.id = recalc.id
    AND (t.is_overtime IS DISTINCT FROM CASE WHEN recalc.ot > 0 THEN 1 ELSE 0 END
      OR t.overtime_seconds IS DISTINCT FROM CASE WHEN recalc.ot > 0 THEN recalc.ot END);
END;
$$;
