import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { PROJECT_SLUGS_TAG } from '@/lib/cache-tags';
import { isMissingSlugColumn } from '@/lib/recruiting/position-slug';
import { projectPath, projectRouteLookup, type ProjectQuery } from '@/lib/project-slug';

/**
 * id → slug for every project (active and archived). Small table, cached for
 * five minutes and busted on project create.
 *
 * Safe before the slug migration: if projects.slug does not exist yet, this
 * returns an empty map, so every link falls back to the numeric URL and no
 * redirect happens.
 */
async function loadProjectSlugMap(): Promise<Record<string, string>> {
  const sb = createAdminClient();
  const { data, error } = await sb.from('projects').select('id, slug');
  if (error) {
    if (isMissingSlugColumn(error.message)) return {};
    throw new Error(`project slugs: ${error.message}`);
  }
  const map: Record<string, string> = {};
  for (const row of (data ?? []) as Array<{ id: number; slug: string | null }>) {
    const slug = typeof row.slug === 'string' ? row.slug.trim() : '';
    if (slug) map[String(row.id)] = slug;
  }
  return map;
}

// Built lazily so importing this module (e.g. from notifications in unit tests)
// does not touch the Next.js cache at load time.
let cachedLoader: (() => Promise<Record<string, string>>) | null = null;

export function getProjectSlugMap(): Promise<Record<string, string>> {
  cachedLoader ??= unstable_cache(loadProjectSlugMap, ['project-slug-map'], {
    revalidate: 300,
    tags: [PROJECT_SLUGS_TAG],
  });
  return cachedLoader();
}

/** Resolve a `/projects/[id]` route param (numeric id or slug) to the project id + slug. */
export async function resolveProjectParam(
  raw: string,
): Promise<{ id: number; slug: string | null } | null> {
  const lookup = projectRouteLookup(raw);
  if (!lookup) return null;
  const map = await getProjectSlugMap();
  if ('id' in lookup) return { id: lookup.id, slug: map[String(lookup.id)] ?? null };
  for (const [id, slug] of Object.entries(map)) {
    if (slug === lookup.slug) return { id: Number(id), slug };
  }
  return null;
}

/** projectPath() for callers that only have the numeric id. */
export async function projectPathById(
  projectId: number | string,
  sub?: string | null,
  query?: ProjectQuery,
): Promise<string> {
  let slug: string | null = null;
  try {
    slug = (await getProjectSlugMap())[String(projectId)] ?? null;
  } catch {
    slug = null; // a slug lookup failure must never break a notification or page
  }
  return projectPath({ id: projectId, slug }, sub, query);
}
