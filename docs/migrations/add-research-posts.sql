-- Run this in Supabase → SQL Editor → New query  (staging first, then prod)
-- Adds the Market Research feature:
--   1. research_posts   — articles the intelligence analyst writes + publishes
--                         from the portal (/research)
--   2. research-covers  — PUBLIC storage bucket for article cover images
--
-- The public website (RS_Web-Digital /market-research) reads this table the
-- same way Careers reads `positions`. It must only ever select
-- WHERE published = true, and must sanitize body_html again before rendering.
--
-- Idempotent: safe to re-run.

-- 1. research_posts ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS research_posts (
  id                SERIAL PRIMARY KEY,
  title             TEXT NOT NULL,
  slug              TEXT NOT NULL UNIQUE,  -- URL: /market-research/<slug>; locked after first publish
  summary           TEXT,                  -- listing card text + share-preview description
  cover_image_path  TEXT,                  -- object path in the research-covers bucket (not a URL)
  body_html         TEXT NOT NULL DEFAULT '',  -- TipTap HTML, sanitized on write
  published         BOOLEAN NOT NULL DEFAULT FALSE,
  published_at      TIMESTAMPTZ,           -- set on FIRST publish; kept on unpublish/republish
  author_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_name       TEXT,                  -- public byline (defaults to the author's name)
  created_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Website listing query: published posts, newest first.
CREATE INDEX IF NOT EXISTS research_posts_published_idx
  ON research_posts(published, published_at DESC);

-- enable-rls-all-public-tables.sql only covered tables that existed at the
-- time. No policies = no anon/authenticated PostgREST access; the portal and
-- the website's server-side reads use the service role, which bypasses RLS.
ALTER TABLE research_posts ENABLE ROW LEVEL SECURITY;

-- 2. research-covers bucket ------------------------------------------------------
-- Unlike every other app bucket this one is PUBLIC: covers are shown on the
-- public website and used as og:image share previews, which crawlers fetch
-- long after a signed URL would expire. Public = anyone can READ an object by
-- its URL; nobody can list or write (uploads go through the portal's
-- service-role client only). Object names are random, so draft covers aren't
-- guessable. 5 MB cap, JPG/PNG/WebP only.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('research-covers', 'research-covers', true, 5000000, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
