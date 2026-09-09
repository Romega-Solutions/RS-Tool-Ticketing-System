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
  IF EXISTS (SELECT 1 FROM tmp_attendance_day_sessions WHERE in_ts::date <> p_date::date) THEN
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

  -- A session that crosses into an adjacent day can't land on one tagged
  -- Absent/Leave (the day being edited here is governed by p_status above).
  FOR r IN
    SELECT DISTINCT d::date AS dt
    FROM tmp_attendance_day_sessions s,
         generate_series(date_trunc('day', s.in_ts)::date, date_trunc('day', COALESCE(s.out_ts, s.in_ts))::date, interval '1 day') d
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
  -- sees each prior session's already-written duration.
  SELECT (approved_hours_per_week * 3600) INTO v_base_seconds FROM users WHERE id = p_user_id;
  v_base_seconds := COALESCE(v_base_seconds, 15 * 3600);
  SELECT array_agg(to_char(d, 'YYYY-MM-DD')) INTO v_week_dates
  FROM generate_series(p_week_start::date, p_week_start::date + 6, interval '1 day') d;

  FOR r IN SELECT * FROM tmp_attendance_day_sessions ORDER BY in_ts LOOP
    v_duration := NULL; v_is_ot := 0; v_ot_seconds := NULL;

    IF r.out_ts IS NOT NULL THEN
      v_duration := round(extract(epoch FROM (r.out_ts - r.in_ts)))::integer;

      SELECT COALESCE(sum(duration_seconds), 0) INTO v_week_before
      FROM timesheets
      WHERE user_id = p_user_id
        AND date = ANY (v_week_dates)
        AND duration_seconds IS NOT NULL
        AND (r.id IS NULL OR id <> r.id);

      v_ot_seconds := greatest(0, least(v_duration, v_week_before + v_duration - v_base_seconds));
      IF v_ot_seconds > 0 THEN v_is_ot := 1; ELSE v_ot_seconds := NULL; END IF;
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
      WHERE id = r.id;
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
