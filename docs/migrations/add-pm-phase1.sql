-- Internal PM Build Plan — ALL PHASES (1 → 4), self-bootstrapping.
-- Run this in Supabase → SQL Editor → New query. Safe to re-run any time.
--
-- This is the single canonical migration. It creates the base ticketing
-- tables from drizzle/0007 if they don't exist, then adds every Phase 1–4
-- addition on top. Every statement is idempotent (IF NOT EXISTS / DO blocks
-- that swallow duplicate-object exceptions).
--
-- Tables created (or ensured):
--   Base:    projects, project_states, work_items, work_item_assignees
--   Phase 1: work_item_comments, labels, work_item_labels,
--            project_members, work_item_activity
--   Phase 3: cycles
--   Phase 4: saved_views
-- Columns added (idempotently):
--   Phase 1: work_item_assignees.user_id, work_items.archived
--   Phase 3: work_items.cycle_id
--   Phase 4: work_items.parent_id

------------------------------------------------------------------------------
-- 0. Base ticketing tables (from drizzle/0007) — created only if missing.
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id            SERIAL PRIMARY KEY,
  identifier    TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT,
  network       INTEGER NOT NULL DEFAULT 2,
  next_sequence INTEGER NOT NULL DEFAULT 1,
  archived      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_states (
  id         SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  "group"    TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#6b7280',
  sequence   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS work_items (
  id           SERIAL PRIMARY KEY,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sequence_id  INTEGER NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  priority     TEXT NOT NULL DEFAULT 'none',
  state_id     INTEGER REFERENCES project_states(id) ON DELETE SET NULL,
  target_date  TEXT,
  completed_at TEXT,
  created_by   INTEGER,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'work_items_project_seq_unique'
  ) THEN
    ALTER TABLE work_items
      ADD CONSTRAINT work_items_project_seq_unique UNIQUE (project_id, sequence_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS work_item_assignees (
  id           SERIAL PRIMARY KEY,
  work_item_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  member_key   TEXT NOT NULL
);

------------------------------------------------------------------------------
-- 1. work_item_comments
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_item_comments (
  id           SERIAL PRIMARY KEY,
  work_item_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  author_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body         TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS work_item_comments_work_item_idx
  ON work_item_comments(work_item_id);

------------------------------------------------------------------------------
-- 2. labels
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS labels (
  id         SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#6b7280'
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'labels_project_name_unique'
  ) THEN
    ALTER TABLE labels
      ADD CONSTRAINT labels_project_name_unique UNIQUE (project_id, name);
  END IF;
END $$;

------------------------------------------------------------------------------
-- 3. work_item_labels (join table)
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_item_labels (
  id           SERIAL PRIMARY KEY,
  work_item_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  label_id     INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'work_item_labels_unique'
  ) THEN
    ALTER TABLE work_item_labels
      ADD CONSTRAINT work_item_labels_unique UNIQUE (work_item_id, label_id);
  END IF;
END $$;

------------------------------------------------------------------------------
-- 4. project_members (controls assignee picker + project visibility)
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_members (
  id         SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member',   -- 'lead' | 'member' | 'viewer'
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_members_unique'
  ) THEN
    ALTER TABLE project_members
      ADD CONSTRAINT project_members_unique UNIQUE (project_id, user_id);
  END IF;
END $$;

------------------------------------------------------------------------------
-- 5. work_item_activity (audit log for task detail drawer)
------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_item_activity (
  id           SERIAL PRIMARY KEY,
  work_item_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  actor_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action       TEXT NOT NULL,         -- 'created' | 'edited' | 'state_changed' | 'assigned' | 'unassigned' | 'commented' | 'archived'
  from_value   TEXT,
  to_value     TEXT,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS work_item_activity_work_item_idx
  ON work_item_activity(work_item_id);

------------------------------------------------------------------------------
-- 6. work_item_assignees.user_id  (§ 10 Q1 — real FK; keep member_key for now)
------------------------------------------------------------------------------
ALTER TABLE work_item_assignees
  ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

-- One-time backfill: derive user_id from member_key (== users.plane_member_id).
-- Harmless no-op if member_key never matched (rows simply keep user_id = NULL).
UPDATE work_item_assignees AS wia
SET    user_id = u.id
FROM   users AS u
WHERE  wia.user_id IS NULL
  AND  u.plane_member_id = wia.member_key;

CREATE INDEX IF NOT EXISTS work_item_assignees_user_idx
  ON work_item_assignees(user_id);

------------------------------------------------------------------------------
-- 7. work_items.archived  (§ 10 Q5 — soft delete)
------------------------------------------------------------------------------
ALTER TABLE work_items
  ADD COLUMN IF NOT EXISTS archived INTEGER NOT NULL DEFAULT 0;

------------------------------------------------------------------------------
-- PHASE 3: cycles (sprints) + work_items.cycle_id
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

ALTER TABLE work_items
  ADD COLUMN IF NOT EXISTS cycle_id INTEGER REFERENCES cycles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS work_items_cycle_idx ON work_items(cycle_id);

------------------------------------------------------------------------------
-- PHASE 4: sub-issues (parent_id on work_items)
------------------------------------------------------------------------------
ALTER TABLE work_items
  ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES work_items(id) ON DELETE CASCADE;

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
