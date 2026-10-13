// Public apply links on the marketing site: https://romega-solutions.com/apply/{slug}
// The slug is derived once at create time and is not rewritten when the title changes.

export const PUBLIC_WEBSITE_ORIGIN = 'https://romega-solutions.com';

const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * Lowercase, strip accents, collapse every non-alphanumeric run (including
 * em dash) to a single hyphen, and trim hyphens. Empty titles become "position".
 * Mirrors the backfill expression in drizzle/0014_positions_slug.sql.
 */
export function slugifyPositionTitle(title: string): string {
  const hyphenated = title
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return hyphenated || 'position';
}

/** First free slug: the base, then base-2, base-3, ... */
export function allocatePositionSlug(base: string, taken: ReadonlySet<string>): string {
  const root = base || 'position';
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}

/**
 * Assign slugs in id order. The lowest id keeps the base slug; later duplicates
 * get -2, -3, ... This is the same rule the migration uses when backfilling.
 */
export function assignPositionSlugs(rows: { id: number; jobTitle: string }[]): Map<number, string> {
  const taken = new Set<string>();
  const assigned = new Map<number, string>();
  const ordered = [...rows].sort((a, b) => a.id - b.id);
  for (const row of ordered) {
    const slug = allocatePositionSlug(slugifyPositionTitle(row.jobTitle), taken);
    taken.add(slug);
    assigned.set(row.id, slug);
  }
  return assigned;
}

export function positionApplyKey(position: { id: number; slug?: string | null }): string {
  const slug = position.slug?.trim();
  return slug || String(position.id);
}

export function publicPositionApplyUrl(position: { id: number; slug?: string | null }): string {
  return `${PUBLIC_WEBSITE_ORIGIN}/apply/${positionApplyKey(position)}`;
}

/** Portal `/apply/[positionId]` accepts a numeric id or a slug. */
export function positionApplyLookup(raw: string): { id: number } | { slug: string } | null {
  const key = raw.trim();
  if (/^[1-9]\d*$/.test(key)) {
    const id = Number(key);
    if (Number.isSafeInteger(id)) return { id };
  }
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) return { slug: key };
  return null;
}

/** True when PostgREST/Postgres says positions.slug has not been added yet. */
export function isMissingSlugColumn(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  if (!m.includes('slug')) return false;
  return m.includes('does not exist') || m.includes('schema cache') || m.includes('could not find');
}
