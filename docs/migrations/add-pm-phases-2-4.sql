-- Internal PM Build Plan — Phases 2-4 only
-- Run this in Supabase → SQL Editor → New query.
-- Safe to re-run (everything is idempotent).
--
-- Prerequisite: Phase 1 (docs/migrations/add-pm-phase1.sql) already applied.
-- This file ONLY adds:
--   PHASE 3: cycles table + work_items.cycle_id column
--   PHASE 4: work_items.parent_id (sub-issues) + saved_views table

------------------------------------------------------------------------------
-- PHASE 3: cycles (sprints)
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cycles (
  id         SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  start_date TEXT NOT NULL,           -- YYYY-MM-DD
  end_date   TEXT NOT NULL,           -- YYYY-MM-DD
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS cycles_project_idx ON cycles(project_id);

------------------------------------------------------------------------------
-- PHASE 3: work_items.cycle_id
------------------------------------------------------------------------------
ALTER TABLE work_items
  ADD COLUMN IF NOT EXISTS cycle_id INTEGER;

-- Add FK only if it doesn't already exist (catalog check — no exception games).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'work_items_cycle_id_fkey'
  ) THEN
    ALTER TABLE work_items
      ADD CONSTRAINT work_items_cycle_id_fkey
      FOREIGN KEY (cycle_id) REFERENCES cycles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS work_items_cycle_idx ON work_items(cycle_id);

------------------------------------------------------------------------------
-- PHASE 4: work_items.parent_id (sub-issues)
------------------------------------------------------------------------------
ALTER TABLE work_items
  ADD COLUMN IF NOT EXISTS parent_id INTEGER;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'work_items_parent_id_fkey'
  ) THEN
    ALTER TABLE work_items
      ADD CONSTRAINT work_items_parent_id_fkey
      FOREIGN KEY (parent_id) REFERENCES work_items(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS work_items_parent_idx ON work_items(parent_id);

------------------------------------------------------------------------------
-- PHASE 4: saved_views (per-user filter presets)
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_views (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,   -- NULL = global (e.g. my-tasks)
  name       TEXT NOT NULL,
  filters    JSONB NOT NULL,            -- { assignee?, label?, priority?, dueSoon?, cycle? }
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS saved_views_user_idx ON saved_views(user_id);
CREATE INDEX IF NOT EXISTS saved_views_project_idx ON saved_views(project_id);
