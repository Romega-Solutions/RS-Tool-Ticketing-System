-- Run this in Supabase → SQL Editor → New query
-- Adds the leads table used by /sales/leads (the in-app lightweight CRM).

CREATE TABLE IF NOT EXISTS leads (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT,
  company      TEXT,
  stage        TEXT NOT NULL DEFAULT 'new',
  value        INTEGER NOT NULL DEFAULT 0,
  notes        TEXT,
  assigned_to  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS leads_stage_idx       ON leads(stage);
CREATE INDEX IF NOT EXISTS leads_assigned_to_idx ON leads(assigned_to);

-- Allowed stage values (enforced in app, indexed here for fast filtering):
--   new        — just captured, not yet contacted
--   contacted  — first touch done
--   qualified  — confirmed fit, real opportunity
--   proposal   — proposal sent
--   won        — closed-won
--   lost       — closed-lost
