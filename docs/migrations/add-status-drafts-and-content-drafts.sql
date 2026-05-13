-- Run in Supabase → SQL Editor → New query
-- Stores PM weekly draft snapshots and marketing repurposed content outputs.

CREATE TABLE IF NOT EXISTS status_drafts (
  id           SERIAL PRIMARY KEY,
  week_start   TEXT NOT NULL UNIQUE,      -- Monday YYYY-MM-DD (PHT week)
  stats        JSONB NOT NULL,            -- deterministic weekly aggregations
  draft        TEXT,                      -- AI-generated PM summary
  model        TEXT,
  tokens_in    INTEGER,
  tokens_out   INTEGER,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  generated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS status_drafts_week_start_idx
  ON status_drafts(week_start DESC);

CREATE TABLE IF NOT EXISTS content_drafts (
  id             SERIAL PRIMARY KEY,
  source_title   TEXT NOT NULL,
  source_type    TEXT NOT NULL,           -- blog | transcript | case-study | other
  source_content TEXT NOT NULL,
  outputs        JSONB NOT NULL,          -- LinkedIn / X / newsletter / Instagram outputs
  model          TEXT,
  tokens_in      INTEGER,
  tokens_out     INTEGER,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS content_drafts_created_at_idx
  ON content_drafts(created_at DESC);
