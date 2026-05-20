-- Normalize users.team and projects.team to the canonical org-chart
-- departments defined in src/lib/orgchart.ts (`APP_DEPARTMENTS`).
--
-- Run this in Supabase → SQL Editor → New query. Safe to re-run.
-- After this completes, users.team / projects.team is either NULL or one of
-- the canonical names below. Anything that doesn't map cleanly is set to
-- NULL — that way the dropdown stays consistent with the org chart.
--
-- Canonical departments (must match APP_DEPARTMENTS exactly):
--   AI & Technology
--   Design
--   Social Media
--   Marketing & Brand Content
--   Sales & Account Management
--   Recruitment
--   Human Resources
--   Finance & Bookkeeping
--   Market Research & Analytics
--   Executive & Admin

------------------------------------------------------------------------------
-- STEP 1 — Normalize known aliases to canonical names
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _normalize_team(t TEXT) RETURNS TEXT AS $$
DECLARE
  n TEXT;
BEGIN
  IF t IS NULL THEN RETURN NULL; END IF;
  n := lower(regexp_replace(t, '\s+', ' ', 'g'));
  n := trim(n);

  IF n IN ('ai & technology', 'ai and technology', 'it/engineering', 'engineering', 'tech', 'technology', 'ai', 'it') THEN
    RETURN 'AI & Technology';
  END IF;
  IF n IN ('design', 'design/pm', 'design / pm', 'design and pm', 'product design', 'designer') THEN
    RETURN 'Design';
  END IF;
  IF n IN ('social media', 'social', 'sm', 'socials') THEN
    RETURN 'Social Media';
  END IF;
  IF n IN ('marketing & brand content', 'marketing and brand content', 'marketing', 'brand', 'content', 'brand content') THEN
    RETURN 'Marketing & Brand Content';
  END IF;
  IF n IN ('sales & account management', 'sales and account management', 'sales', 'accounts', 'account management', 'am') THEN
    RETURN 'Sales & Account Management';
  END IF;
  IF n IN ('recruitment', 'recruiting', 'talent acquisition', 'ta') THEN
    RETURN 'Recruitment';
  END IF;
  IF n IN ('human resources', 'hr', 'people ops', 'people operations', 'people') THEN
    RETURN 'Human Resources';
  END IF;
  IF n IN ('finance & bookkeeping', 'finance and bookkeeping', 'finance', 'bookkeeping', 'accounting') THEN
    RETURN 'Finance & Bookkeeping';
  END IF;
  IF n IN ('market research & analytics', 'market research and analytics', 'analytics', 'market research', 'research') THEN
    RETURN 'Market Research & Analytics';
  END IF;
  IF n IN ('executive & admin', 'executive and admin', 'executive', 'admin', 'leadership', 'operations', 'ops', 'exec') THEN
    RETURN 'Executive & Admin';
  END IF;

  RETURN t;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

UPDATE users
SET    team = _normalize_team(team)
WHERE  team IS NOT NULL
  AND  team <> _normalize_team(team);

UPDATE projects
SET    team = _normalize_team(team)
WHERE  team IS NOT NULL
  AND  team <> _normalize_team(team);

------------------------------------------------------------------------------
-- STEP 2 — NULL out anything that still isn't canonical
------------------------------------------------------------------------------
-- After Step 1, any team value that doesn't match the canonical list is a
-- ghost value. Set it to NULL so the dropdown can't show it.

UPDATE users
SET    team = NULL,
       updated_at = CURRENT_TIMESTAMP
WHERE  team IS NOT NULL
  AND  team NOT IN (
    'AI & Technology',
    'Design',
    'Social Media',
    'Marketing & Brand Content',
    'Sales & Account Management',
    'Recruitment',
    'Human Resources',
    'Finance & Bookkeeping',
    'Market Research & Analytics',
    'Executive & Admin'
  );

UPDATE projects
SET    team = NULL,
       updated_at = CURRENT_TIMESTAMP
WHERE  team IS NOT NULL
  AND  team NOT IN (
    'AI & Technology',
    'Design',
    'Social Media',
    'Marketing & Brand Content',
    'Sales & Account Management',
    'Recruitment',
    'Human Resources',
    'Finance & Bookkeeping',
    'Market Research & Analytics',
    'Executive & Admin'
  );

------------------------------------------------------------------------------
-- Cleanup
------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS _normalize_team(TEXT);

------------------------------------------------------------------------------
-- VERIFICATION — run after the UPDATEs to confirm the cleanup worked.
-- Both queries should return 0 rows. If they don't, the listed rows still
-- have a non-canonical team value (they were nulled by Step 2; this guards
-- against future drift).
------------------------------------------------------------------------------
-- SELECT id, name, email, team FROM users
-- WHERE team IS NOT NULL AND team NOT IN (
--   'AI & Technology','Design','Social Media','Marketing & Brand Content',
--   'Sales & Account Management','Recruitment','Human Resources',
--   'Finance & Bookkeeping','Market Research & Analytics','Executive & Admin'
-- );
--
-- SELECT id, identifier, name, team FROM projects
-- WHERE team IS NOT NULL AND team NOT IN (
--   'AI & Technology','Design','Social Media','Marketing & Brand Content',
--   'Sales & Account Management','Recruitment','Human Resources',
--   'Finance & Bookkeeping','Market Research & Analytics','Executive & Admin'
-- );
