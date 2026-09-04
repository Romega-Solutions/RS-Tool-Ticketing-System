-- One current Onboarding Lead for all active onboarding records.
-- Existing per-onboarder lead columns remain as historical snapshots.

CREATE TABLE IF NOT EXISTS onboarding_settings (
  id                      SMALLINT PRIMARY KEY CHECK (id = 1),
  onboarding_lead_user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by              INTEGER REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO onboarding_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE onboarding_settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION set_global_onboarding_lead(
  p_lead_user_id INTEGER,
  p_updated_by INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_name TEXT;
  v_actor_name TEXT;
  v_affected INTEGER := 0;
BEGIN
  SELECT name
  INTO v_lead_name
  FROM users
  WHERE id = p_lead_user_id
    AND is_active = 1
    AND LOWER(BTRIM(role)) IN ('lead', 'admin', 'founder', 'ceo');

  IF v_lead_name IS NULL THEN
    RAISE EXCEPTION 'Selected user is not an eligible active Onboarding Lead';
  END IF;

  SELECT name INTO v_actor_name FROM users WHERE id = p_updated_by;

  INSERT INTO onboarder_history (
    onboarder_id, user_id, user_name, field, old_value, new_value, summary
  )
  SELECT
    o.id,
    p_updated_by,
    COALESCE(v_actor_name, 'System'),
    'onboarding_lead',
    o.onboarding_lead,
    v_lead_name,
    'Global Onboarding Lead changed from '''
      || COALESCE(o.onboarding_lead, 'Unassigned')
      || ''' to ''' || v_lead_name || ''''
  FROM onboarders o
  WHERE o.status IN ('pre_onboarding', 'day_one', 'thirty_day', 'ninety_day')
    AND o.onboarding_lead_id IS DISTINCT FROM p_lead_user_id;

  UPDATE onboarders
  SET onboarding_lead_id = p_lead_user_id,
      onboarding_lead = v_lead_name,
      onboarding_lead_teams_email = NULL,
      updated_at = NOW()
  WHERE status IN ('pre_onboarding', 'day_one', 'thirty_day', 'ninety_day')
    AND onboarding_lead_id IS DISTINCT FROM p_lead_user_id;

  GET DIAGNOSTICS v_affected = ROW_COUNT;

  INSERT INTO onboarding_settings (
    id, onboarding_lead_user_id, updated_at, updated_by
  )
  VALUES (1, p_lead_user_id, NOW(), p_updated_by)
  ON CONFLICT (id) DO UPDATE
  SET onboarding_lead_user_id = EXCLUDED.onboarding_lead_user_id,
      updated_at = EXCLUDED.updated_at,
      updated_by = EXCLUDED.updated_by;

  RETURN v_affected;
END;
$$;

REVOKE ALL ON FUNCTION set_global_onboarding_lead(INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION set_global_onboarding_lead(INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION set_global_onboarding_lead(INTEGER, INTEGER) TO service_role;
