-- New project-scoped discussion comments (separate from work_item_comments).
-- Mirrors work_item_comments exactly, scoped to a project instead of a task.
-- Additive + idempotent. Apply via scripts/apply-migration.ts (pooler can't run DDL).
CREATE TABLE IF NOT EXISTS project_comments (
  id         serial PRIMARY KEY NOT NULL,
  project_id integer NOT NULL REFERENCES projects(id) ON DELETE cascade,
  author_id  integer NOT NULL REFERENCES users(id) ON DELETE cascade,
  body       text NOT NULL,
  created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS project_comments_project_idx ON project_comments USING btree (project_id);
