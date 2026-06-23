-- ─────────────────────────────────────────────────────────────────────────────
-- Storage buckets — canonical "ensure every app bucket exists" migration
-- ─────────────────────────────────────────────────────────────────────────────
-- These buckets are referenced by src/lib/storage.ts (and learning/actions.ts).
-- None of them can be modelled by Drizzle, so they live here. All are PRIVATE —
-- the app uploads with the service-role admin client and hands callers a signed
-- URL. If a bucket is absent, the matching upload fails at runtime with
-- "Bucket not found" (this is exactly what broke PM task-image uploads).
--
-- Idempotent: ON CONFLICT (id) DO NOTHING. Safe to re-run. Bucket names are
-- overridable via the SUPABASE_*_BUCKET env vars (defaults shown below).
--
-- Apply with:
--   npx tsx --env-file=.env scripts/apply-migration.ts docs/migrations/add-storage-buckets.sql
-- (Supabase Studio -> Storage -> Create bucket does the same thing by hand.)
-- ─────────────────────────────────────────────────────────────────────────────

-- candidate-resumes  (SUPABASE_RESUMES_BUCKET) — recruiting resume PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('candidate-resumes', 'candidate-resumes', false)
ON CONFLICT (id) DO NOTHING;

-- onboarder-docs  (SUPABASE_ONBOARDER_BUCKET) — gov IDs, W-8, contracts, etc.
-- (also created by docs/migrations/add-onboarders-tables.sql; kept here for completeness)
INSERT INTO storage.buckets (id, name, public)
VALUES ('onboarder-docs', 'onboarder-docs', false)
ON CONFLICT (id) DO NOTHING;

-- learning-content  (SUPABASE_LEARNING_BUCKET) — LMS lesson videos + certificate PDFs.
-- No size cap: lesson videos can be large.
INSERT INTO storage.buckets (id, name, public)
VALUES ('learning-content', 'learning-content', false)
ON CONFLICT (id) DO NOTHING;

-- task-images  (SUPABASE_TASK_IMAGES_BUCKET) — JPG/PNG screenshots embedded in
-- work-item (PM/ticket) descriptions. 10 MB cap, JPG/PNG only (defense in depth
-- on top of src/lib/task-image-uploads.ts validation).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('task-images', 'task-images', false, 10000000, ARRAY['image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

-- timesheet-edit-docs  (SUPABASE_TIMESHEET_DOCS_BUCKET) — optional supporting
-- files attached to time-edit requests. 10 MB cap.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('timesheet-edit-docs', 'timesheet-edit-docs', false, 10000000)
ON CONFLICT (id) DO NOTHING;
