// Market Research articles (table: research_posts, see
// docs/migrations/add-research-posts.sql). Written + published by the
// intelligence analyst from /research; the public website reads published rows.
// Pure helpers only — safe to import from client components and tests.

export type ResearchPost = {
  id: number;
  title: string;
  slug: string;
  summary: string | null;
  cover_image_path: string | null;
  body_html: string;
  published: boolean;
  published_at: string | null;
  author_id: number | null;
  author_name: string | null;
  created_by: number | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
};

// Public bucket — the website builds cover URLs from this name, so it's fixed
// rather than env-overridable like the private buckets in storage.ts.
export const RESEARCH_COVERS_BUCKET = 'research-covers';

export const MAX_SLUG_LENGTH = 80;
export const MAX_SUMMARY_LENGTH = 300;
export const MAX_COVER_BYTES = 5_000_000;

const COVER_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

// Lowercase, ASCII, hyphen-separated — what ends up in /market-research/<slug>.
export function slugifyTitle(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')   // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '');
}

export function isValidSlug(slug: string): boolean {
  return slug.length > 0
    && slug.length <= MAX_SLUG_LENGTH
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

// Extension for an accepted cover upload, or null if the type isn't allowed.
export function coverImageExtension(file: { type: string }): string | null {
  return COVER_TYPES.get(file.type) ?? null;
}

// Cover objects live in a public bucket, so the URL is derivable from the path
// alone (the website builds it the same way).
export function researchCoverUrl(path: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !base) return null;
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `${base.replace(/\/+$/, '')}/storage/v1/object/public/${RESEARCH_COVERS_BUCKET}/${encoded}`;
}

// What's missing before a post can go live on the public site. Empty = OK.
export function publishBlockers(post: {
  title: string;
  slug: string;
  summary: string | null;
  cover_image_path: string | null;
  bodyIsEmpty: boolean;
}): string[] {
  const missing: string[] = [];
  if (!post.title.trim()) missing.push('title');
  if (!isValidSlug(post.slug)) missing.push('URL slug');
  if (!post.summary?.trim()) missing.push('summary');
  if (!post.cover_image_path) missing.push('cover image');
  if (post.bodyIsEmpty) missing.push('article body');
  return missing;
}
