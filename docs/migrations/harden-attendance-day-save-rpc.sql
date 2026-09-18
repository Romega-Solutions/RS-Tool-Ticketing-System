-- Hardening pass on save_attendance_day (redefines the function from
-- add-attendance-day-save-rpc.sql; apply that file first, then this one).
-- CREATE OR REPLACE with an unchanged signature, so it is safe to re-run.
--
-- Note: a session belongs to the day it STARTED on, so tagging the following
-- day Absent/Leave while an earlier day's shift clocks out on it is allowed, and
-- a shift may clock out on a day already tagged Absent/Leave. The old
-- "session can't cross into an Absent/Leave day" rule is removed. Absent/Leave
-- days still can't OWN sessions, and sessions still can't overlap.
--
-- Fixes:
--  1. Every submitted session id must belong to this user AND this day. The old
--     UPDATE ... WHERE id = r.id would rewrite any row a stale/forged id named.
--  2. Overtime is reconciled across the whole week after every save, in
--     chronological order, so editing/deleting an earlier session no longer
--     leaves later sessions with stale is_overtime / overtime_seconds. Same
--     formula as computeOvertime() (src/lib/utils.ts): base allowance only.
--  3. Saves for one user are serialized with a transaction-scoped advisory
--     lock, so two concurrent saves can't interleave their delete/insert steps.
--
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
  r                 record;
  v_duration        integer;
  v_ot_seconds      integer;
  v_is_ot           integer;
  v_cum_seconds     integer;
BEGIN
  -- Serialize concurrent saves for the same user (released at commit/rollback).
  PERFORM pg_advisory_xact_lock(hashtext('save_attendance_day:' || p_user_id::text));

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

  -- Every submitted id must be one of THIS user's sessions on THIS day.
  IF EXISTS (
    SELECT 1 FROM tmp_attendance_day_sessions s
    WHERE s.id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM timesheets t
        WHERE t.id = s.id AND t.user_id = p_user_id AND t.date = p_date
      )
  ) THEN
    RAISE EXCEPTION 'A session doesn''t belong to this user''s day — reload the page and try again.';
  END IF;

  -- Delete sessions dropped from this day's list.
  DELETE FROM timesheets
  WHERE user_id = p_user_id AND date = p_date
    AND id <> ALL (COALESCE(v_submitted_ids, ARRAY[]::integer[]));

  -- Insert/update sessions in chronological order so weekly-overtime math
  -- sees each prior session's already-written duration.
  SELECT (approved_hours_per_week * 3600) INTO v_base_seconds FROM users WHERE id = p_user_id;
  v_base_seconds := COALESCE(v_base_seconds, 15 * 3600);
  SELECT array_agg(to_char(d, 'YYYY-MM-DD')) INTO v_week_dates
  FROM generate_series(p_week_start::date, p_week_start::date + 6, interval '1 day') d;

  FOR r IN SELECT * FROM tmp_attendance_day_sessions ORDER BY in_ts LOOP
    v_duration := NULL;
    IF r.out_ts IS NOT NULL THEN
      v_duration := round(extract(epoch FROM (r.out_ts - r.in_ts)))::integer;
    END IF;

    -- Overtime fields are (re)computed for the whole week by the pass below.
    IF r.id IS NOT NULL THEN
      UPDATE timesheets SET
        clocked_in_at = r.clocked_in_at,
        clocked_out_at = r.clocked_out_at,
        date = p_date,
        duration_seconds = v_duration,
        edited_by = p_edited_by,
        edited_at = v_now
      WHERE id = r.id AND user_id = p_user_id AND date = p_date;
    ELSE
      INSERT INTO timesheets (user_id, clocked_in_at, clocked_out_at, date, duration_seconds, is_overtime, overtime_seconds, edited_by, edited_at)
      VALUES (p_user_id, r.clocked_in_at, r.clocked_out_at, p_date, v_duration, 0, NULL, p_edited_by, v_now);
    END IF;
  END LOOP;

  -- Reconcile overtime for the whole week in chronological order. Only rows
  -- whose values actually change are written, and edited_by/edited_at are left
  -- alone so untouched sessions don't gain a misleading "Edited" marker.
  v_cum_seconds := 0;
  FOR r IN
    SELECT id, duration_seconds, is_overtime, overtime_seconds
    FROM timesheets
    WHERE user_id = p_user_id
      AND date = ANY (v_week_dates)
      AND duration_seconds IS NOT NULL
    ORDER BY clocked_in_at::timestamptz, id
  LOOP
    v_ot_seconds := greatest(0, least(r.duration_seconds, v_cum_seconds + r.duration_seconds - v_base_seconds));
    v_is_ot := CASE WHEN v_ot_seconds > 0 THEN 1 ELSE 0 END;
    IF v_ot_seconds = 0 THEN v_ot_seconds := NULL; END IF;

    IF r.is_overtime IS DISTINCT FROM v_is_ot OR r.overtime_seconds IS DISTINCT FROM v_ot_seconds THEN
      UPDATE timesheets SET is_overtime = v_is_ot, overtime_seconds = v_ot_seconds WHERE id = r.id;
    END IF;
    v_cum_seconds := v_cum_seconds + r.duration_seconds;
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
