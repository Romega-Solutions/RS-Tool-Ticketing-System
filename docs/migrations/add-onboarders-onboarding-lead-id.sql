-- Connect each onboarder to the internal users assigned as onboarding lead and
-- direct supervisor.
-- Safe to run more than once. This does not create a portal account for the
-- candidate/new hire; it only links the internal Onboarding Lead.

ALTER TABLE onboarders
  ADD COLUMN IF NOT EXISTS onboarding_lead_id INTEGER
  REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS direct_supervisor_id INTEGER
  REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS onboarders_onboarding_lead_id_idx
  ON onboarders(onboarding_lead_id);
CREATE INDEX IF NOT EXISTS onboarders_direct_supervisor_id_idx
  ON onboarders(direct_supervisor_id);

-- Safely link historical rows only when their saved lead name maps to exactly
-- one existing user. Ambiguous or unmatched names remain unchanged for HR to
-- resolve manually rather than risking a wrong assignment.
UPDATE onboarders AS onboarder
SET onboarding_lead_id = matched_user.id
FROM users AS matched_user
WHERE onboarder.onboarding_lead_id IS NULL
  AND onboarder.onboarding_lead IS NOT NULL
  AND LOWER(BTRIM(onboarder.onboarding_lead)) = LOWER(BTRIM(matched_user.name))
  AND (
    SELECT COUNT(*)
    FROM users AS possible_user
    WHERE LOWER(BTRIM(possible_user.name)) = LOWER(BTRIM(onboarder.onboarding_lead))
  ) = 1;

UPDATE onboarders AS onboarder
SET direct_supervisor_id = matched_user.id
FROM users AS matched_user
WHERE onboarder.direct_supervisor_id IS NULL
  AND onboarder.direct_supervisor IS NOT NULL
  AND LOWER(BTRIM(onboarder.direct_supervisor)) = LOWER(BTRIM(matched_user.name))
  AND (
    SELECT COUNT(*)
    FROM users AS possible_user
    WHERE LOWER(BTRIM(possible_user.name)) = LOWER(BTRIM(onboarder.direct_supervisor))
  ) = 1;
