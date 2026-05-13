-- Run in Supabase → SQL Editor → New query
-- One row per day, holds the deterministic stats + the AI-generated narrative.
-- The `date UNIQUE` constraint means re-running the generator upserts in place.

CREATE TABLE IF NOT EXISTS briefings (
  id           SERIAL PRIMARY KEY,
  date         TEXT NOT NULL UNIQUE,      -- YYYY-MM-DD (PHT)
  stats        JSONB NOT NULL,            -- deterministic aggregations
  narrative    TEXT,                      -- AI narrative (nullable if generation failed)
  model        TEXT,                      -- e.g. 'llama-3.3-70b-versatile' or NULL
  tokens_in    INTEGER,                   -- for cost tracking
  tokens_out   INTEGER,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  generated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS briefings_date_idx ON briefings(date DESC);
