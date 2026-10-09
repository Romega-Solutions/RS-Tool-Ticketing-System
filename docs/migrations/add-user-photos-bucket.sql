-- ─────────────────────────────────────────────────────────────────────────────
-- user-photos storage bucket — profile photos owned by the portal
-- ─────────────────────────────────────────────────────────────────────────────
-- PUBLIC on purpose (staff headshots): read via the plain public URL, no signed
-- URLs needed, so other internal tools can display them too. Uploads still go
-- through the service-role admin client only. The object key is stored in
-- user_reporting.photo_path (drizzle/0013_departments_reporting_lines.sql).
-- 5 MB cap, JPG/PNG/WebP only.
--
-- Idempotent. Apply with:
--   npx tsx --env-file=.env scripts/apply-migration.ts docs/migrations/add-user-photos-bucket.sql
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('user-photos', 'user-photos', true, 5000000, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
