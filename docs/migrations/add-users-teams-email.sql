-- Store a Microsoft Teams contact address once per internal user. Onboarding
-- reuses this value whenever the user is assigned as lead or supervisor.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS teams_email TEXT;

-- Preserve existing per-onboarder overrides only when every nonblank value for
-- a user agrees. Conflicting historical values are intentionally left for an
-- admin to resolve rather than choosing one silently.
WITH historical_emails AS (
  SELECT onboarding_lead_id AS user_id, BTRIM(onboarding_lead_teams_email) AS teams_email
  FROM onboarders
  WHERE onboarding_lead_id IS NOT NULL
    AND NULLIF(BTRIM(onboarding_lead_teams_email), '') IS NOT NULL

  UNION ALL

  SELECT direct_supervisor_id AS user_id, BTRIM(direct_supervisor_teams_email) AS teams_email
  FROM onboarders
  WHERE direct_supervisor_id IS NOT NULL
    AND NULLIF(BTRIM(direct_supervisor_teams_email), '') IS NOT NULL
), unambiguous_emails AS (
  SELECT user_id, MIN(teams_email) AS teams_email
  FROM historical_emails
  GROUP BY user_id
  HAVING COUNT(DISTINCT LOWER(teams_email)) = 1
)
UPDATE users AS target_user
SET teams_email = source_email.teams_email,
    updated_at = NOW()
FROM unambiguous_emails AS source_email
WHERE target_user.id = source_email.user_id
  AND NULLIF(BTRIM(target_user.teams_email), '') IS NULL;
