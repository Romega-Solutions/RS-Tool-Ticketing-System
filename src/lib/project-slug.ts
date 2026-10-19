// Readable project URLs: /projects/{slug}
//
// The slug is derived once from the project name when the project is created
// and is NOT rewritten on rename, so links never break. Numeric URLs
// (/projects/3) keep working forever: they 308-redirect to the slug URL once a
// project has a slug, and are used as-is when it does not (for example before
// the slug migration has been applied).
//
// The rules here mirror the backfill in drizzle/0015_projects_slug.sql.
// Keep the two in sync.

const COMBINING_MARKS = /[\u0300-\u036f]/g;

/** Slugs that would read like a route or an id get a "-project" suffix. */
export const RESERVED_PROJECT_SLUGS: ReadonlySet<string> = new Set([
  'new',
  'create',
  'edit',
  'archived',
  'settings',
  'discussion',
  'api',
]);

/**
 * Lowercase, strip accents, collapse every non-alphanumeric run to a single
 * hyphen, trim hyphens. Empty names become "project". Digits-only results and
 * reserved words get "-project" appended so a slug can never look like an id.
 */
export function slugifyProjectName(name: string): string {
  const hyphenated = (name ?? '')
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!hyphenated) return 'project';
  if (/^[0-9]+$/.test(hyphenated) || RESERVED_PROJECT_SLUGS.has(hyphenated)) {
    return `${hyphenated}-project`;
  }
  return hyphenated;
}

/** First free slug: the base, then base-2, base-3, ... */
export function allocateProjectSlug(base: string, taken: ReadonlySet<string>): string {
  const root = base || 'project';
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}

/**
 * Assign slugs in id order. The lowest id keeps the base slug; later duplicates
 * get -2, -3, ... Same rule as the migration backfill.
 */
export function assignProjectSlugs(rows: { id: number; name: string }[]): Map<number, string> {
  const taken = new Set<string>();
  const assigned = new Map<number, string>();
  for (const row of [...rows].sort((a, b) => a.id - b.id)) {
    const slug = allocateProjectSlug(slugifyProjectName(row.name), taken);
    taken.add(slug);
    assigned.set(row.id, slug);
  }
  return assigned;
}

export type ProjectRef = { id: number | string; slug?: string | null };

type QueryValue = string | number | boolean | null | undefined | ReadonlyArray<string | number>;
export type ProjectQuery = Record<string, QueryValue> | URLSearchParams;

/** The URL segment for a project: its slug when it has one, else the numeric id. */
export function projectKey(project: ProjectRef): string {
  const slug = project.slug?.trim();
  return slug || String(project.id);
}

/**
 * Build an in-app project URL, e.g.
 *   projectPath({ id: 3, slug: 'romega-portal-general' }, 'settings')
 *     → /projects/romega-portal-general/settings
 *   projectPath({ id: 3 }, '', { task: 42 }) → /projects/3?task=42
 */
export function projectPath(project: ProjectRef, sub?: string | null, query?: ProjectQuery): string {
  const tail = (sub ?? '').replace(/^\/+|\/+$/g, '');
  let path = `/projects/${encodeURIComponent(projectKey(project))}${tail ? `/${tail}` : ''}`;
  const qs = toQueryString(query);
  if (qs) path += `?${qs}`;
  return path;
}

function toQueryString(query: ProjectQuery | undefined): string {
  if (!query) return '';
  if (query instanceof URLSearchParams) return query.toString();
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, String(v));
    } else {
      params.append(key, String(value));
    }
  }
  return params.toString();
}

/** `/projects/[id]` accepts a numeric id or a slug. Anything else is not a project. */
export function projectRouteLookup(raw: string): { id: number } | { slug: string } | null {
  let key = (raw ?? '').trim();
  try { key = decodeURIComponent(key); } catch { /* keep raw */ }
  if (/^\d+$/.test(key)) {
    // Digits only is always an id (slugs are never digits-only).
    const id = Number(key);
    return /^[1-9]/.test(key) && Number.isSafeInteger(id) ? { id } : null;
  }
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) return { slug: key };
  return null;
}
