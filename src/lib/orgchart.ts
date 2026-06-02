// The org chart app is deployed at /org-chart sub-path
const ORG_CHART_BASE = 'https://tools.romega-solutions.com/org-chart';

export type OrgPerson = {
  id: number;
  name: string;
  title: string;
  department: string;
  departmentColor: string | null;
  reportsToName: string | null;
  photoUrl: string | null;
  email: string | null;
};

type RawPerson = {
  id: number;
  name: string;
  title: string;
  departmentId: number;
  departmentName?: string | null;
  departmentColor?: string | null;
  reportsTo?: number | null;
  photoUrl?: string | null;
  email?: string | null;
  isActive: boolean | number;
};

function resolvePhotoUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${ORG_CHART_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

export const APP_DEPARTMENTS = [
  'Design',
  'Social Media',
  'Marketing & Brand Content',
  'Sales & Account Management',
  'Recruitment',
  'Human Resources',
  'Finance & Bookkeeping',
  'Market Research & Analytics',
  'Executive & Admin',
] as const;

/** Canonical team type — exported for callers that want compile-time safety. */
export type CanonicalTeam = (typeof APP_DEPARTMENTS)[number];

/** True if the value matches one of the canonical org-chart departments. */
export function isCanonicalTeam(value: string | null | undefined): value is CanonicalTeam {
  if (!value) return false;
  return (APP_DEPARTMENTS as readonly string[]).includes(value);
}

function normalizeStr(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function tokensOf(s: string): string[] {
  return normalizeStr(s).split(' ').filter(Boolean);
}

function firstLastMatch(orgName: string, inputName: string): boolean {
  const ta = tokensOf(orgName);
  const tb = tokensOf(inputName);
  if (ta.length === 0 || tb.length === 0) return false;
  return ta[0] === tb[0] && ta[ta.length - 1] === tb[tb.length - 1];
}

export function mapOrgDeptToAppTeam(orgDeptName: string): string {
  const norm = normalizeStr(orgDeptName);
  const exact = APP_DEPARTMENTS.find(d => normalizeStr(d) === norm);
  if (exact) return exact;
  const contains = APP_DEPARTMENTS.find(
    d => normalizeStr(d).includes(norm) || norm.includes(normalizeStr(d))
  );
  return contains ?? orgDeptName;
}

export async function fetchPeople(): Promise<RawPerson[]> {
  const key = process.env.ORG_CHART_API_KEY;
  if (!key) {
    console.error('[orgchart] ORG_CHART_API_KEY is not set');
    return [];
  }
  try {
    const res = await fetch(`${ORG_CHART_BASE}/api/people`, {
      headers: { 'X-API-Key': key },
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error(`[orgchart] /api/people → HTTP ${res.status}`);
      return [];
    }
    const raw = await res.json() as unknown;
    if (Array.isArray(raw)) return raw as RawPerson[];
    // handle wrapped shapes: { people: [...] }, { data: [...] }
    if (raw && typeof raw === 'object') {
      for (const key of ['people', 'data', 'items', 'results']) {
        const val = (raw as Record<string, unknown>)[key];
        if (Array.isArray(val)) return val as RawPerson[];
      }
    }
    console.error('[orgchart] unexpected /api/people shape');
    return [];
  } catch (err) {
    console.error('[orgchart] /api/people fetch error:', err);
    return [];
  }
}

function buildOrgPerson(match: RawPerson, active: RawPerson[]): OrgPerson {
  const deptName  = match.departmentName ?? '';
  const manager   = match.reportsTo ? active.find(p => p.id === match.reportsTo) : null;
  return {
    id:              match.id,
    name:            match.name,
    title:           match.title,
    department:      mapOrgDeptToAppTeam(deptName),
    departmentColor: match.departmentColor ?? null,
    reportsToName:   manager?.name ?? null,
    photoUrl:        resolvePhotoUrl(match.photoUrl),
    email:           match.email ?? null,
  };
}

/**
 * Look up an org chart person by email (if available in the list response)
 * then by name — exact first, then first+last token (handles middle names/accents).
 */
export async function lookupPerson(opts: { email?: string; name?: string }): Promise<OrgPerson | null> {
  const { email, name } = opts;
  if (!email && (!name || name.trim().length < 2)) return null;

  const people = await fetchPeople();
  if (!people.length) return null;

  const active = people.filter(p => p.isActive !== false && p.isActive !== 0);
  // Logs never include the actual email or name — those would leak PII into
  // Vercel/server logs that any teammate with log access could read.
  const haveEmail = Boolean(email);
  const haveName  = Boolean(name && name.trim().length >= 2);

  // 1. Email — exact, case-insensitive (works only if API returns email field)
  if (email) {
    const normEmail = email.toLowerCase().trim();
    const byEmail   = active.find(p => p.email?.toLowerCase().trim() === normEmail);
    if (byEmail) {
      console.log(`[orgchart] matched by email (active=${active.length})`);
      return buildOrgPerson(byEmail, active);
    }
  }

  // 2. Name — exact normalised
  if (name) {
    const normName = normalizeStr(name);
    const byExact  = active.find(p => normalizeStr(p.name) === normName);
    if (byExact) {
      console.log(`[orgchart] matched by exact name (active=${active.length})`);
      return buildOrgPerson(byExact, active);
    }

    // 3. Name — first + last token (handles middle names, accents, suffixes)
    const byTokens = active.find(p => firstLastMatch(p.name, name));
    if (byTokens) {
      console.log(`[orgchart] matched by first+last tokens (active=${active.length})`);
      return buildOrgPerson(byTokens, active);
    }
  }

  console.log(`[orgchart] no match (active=${active.length} haveEmail=${haveEmail} haveName=${haveName})`);
  return null;
}

/** Convenience wrapper kept for backward compatibility. */
export async function lookupPersonByName(name: string): Promise<OrgPerson | null> {
  return lookupPerson({ name });
}

// ─────────────────────────────────────────────────────────────────────────
// Photo resolution for lists of people. `pickPhoto` is pure and unit-tested;
// `getPhotoResolver` wraps it with a 5-minute in-memory people cache so list
// endpoints (attendance, presence, sidebar) can map a whole roster to photos
// cheaply without hammering the org-chart service. Mirrors the caching pattern
// already used by `getCanonicalTeams`.
// ─────────────────────────────────────────────────────────────────────────

/** Minimal shape `pickPhoto` needs — RawPerson and OrgPerson both satisfy it. */
type PhotoSource = { name: string; email?: string | null; photoUrl?: string | null };

/**
 * Resolve one person to an absolute photo URL (or null) using the same matching
 * as `lookupPerson`: email-exact → name-exact → first+last token. Identity wins
 * over photo presence — an email/name match returns that person's photo even if
 * it's null, rather than falling through to a different person who has one.
 */
export function pickPhoto(
  active: PhotoSource[],
  who: { name?: string | null; email?: string | null },
): string | null {
  const email = who.email?.toLowerCase().trim();
  const name  = who.name?.trim();

  if (email) {
    const m = active.find(p => p.email?.toLowerCase().trim() === email);
    if (m) return resolvePhotoUrl(m.photoUrl);
  }
  if (name && name.length >= 2) {
    const norm = normalizeStr(name);
    const exact = active.find(p => normalizeStr(p.name) === norm);
    if (exact) return resolvePhotoUrl(exact.photoUrl);
    const tokens = active.find(p => firstLastMatch(p.name, name));
    if (tokens) return resolvePhotoUrl(tokens.photoUrl);
  }
  return null;
}

let _peopleCache: { at: number; people: RawPerson[] } | null = null;
const PEOPLE_TTL_MS = 5 * 60 * 1000;

/** People list cached for 5 minutes. Only caches non-empty responses so a
 *  transient failure never pins an empty list for the whole window. */
export async function getCachedPeople(): Promise<RawPerson[]> {
  const now = Date.now();
  if (_peopleCache && now - _peopleCache.at < PEOPLE_TTL_MS) return _peopleCache.people;
  const people = await fetchPeople();
  if (people.length) _peopleCache = { at: now, people };
  return people;
}

export type PhotoResolver = (who: { name?: string | null; email?: string | null }) => string | null;

/** Build a reusable resolver over the cached active people list. Call once per
 *  request, then map a whole roster through the returned closure. */
export async function getPhotoResolver(): Promise<PhotoResolver> {
  const people = await getCachedPeople();
  const active = people.filter(p => p.isActive !== false && p.isActive !== 0);
  return (who) => pickPhoto(active, who);
}

/**
 * Single source of truth for team names across the app. Tries the org-chart
 * API first (so we pick up live additions/renames), normalizes every value to
 * a canonical `APP_DEPARTMENTS` entry, then dedupes + sorts. Falls back to the
 * static canonical list if the API is unreachable or the key isn't set.
 *
 * Cached for 5 minutes so the dropdown doesn't hammer the org-chart service.
 */
let _canonicalTeamsCache: { at: number; teams: string[] } | null = null;
const CANONICAL_TEAMS_TTL_MS = 5 * 60 * 1000;

export async function getCanonicalTeams(): Promise<string[]> {
  const now = Date.now();
  if (_canonicalTeamsCache && now - _canonicalTeamsCache.at < CANONICAL_TEAMS_TTL_MS) {
    return _canonicalTeamsCache.teams;
  }

  const seen = new Set<string>();
  const people = await fetchPeople();
  for (const p of people) {
    if (p.isActive === false || p.isActive === 0) continue;
    const dept = (p.departmentName ?? '').trim();
    if (!dept) continue;
    seen.add(mapOrgDeptToAppTeam(dept));
  }

  // Always merge with APP_DEPARTMENTS so the static canonical list is the
  // floor — even if the org-chart API briefly returns nothing.
  for (const d of APP_DEPARTMENTS) seen.add(d);

  const teams = [...seen].sort((a, b) => a.localeCompare(b));
  _canonicalTeamsCache = { at: now, teams };
  return teams;
}

// ─────────────────────────────────────────────────────────────────────────
// Org-chart-as-source-of-truth: sync every active user's `team` from the
// org chart, normalised through `mapOrgDeptToAppTeam`. Anything not in the
// org chart is left alone (so manually-curated accounts don't get clobbered)
// and surfaced in the result so an admin can review/fix.
// ─────────────────────────────────────────────────────────────────────────

export type TeamSyncResult = {
  totalUsers: number;
  updated: number;
  unchanged: number;
  unmatched: number;
  errors: number;
  details: Array<{
    userId: number;
    name: string;
    email: string;
    status: 'updated' | 'unchanged' | 'unmatched' | 'error';
    from: string | null;
    to: string | null;
    error?: string;
  }>;
};

export async function syncUserTeamsFromOrgChart(opts?: {
  dryRun?: boolean;
}): Promise<TeamSyncResult> {
  // Inline import to keep this function callable from edge-safe contexts at
  // import time; the admin client is server-only anyway.
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const sb = createAdminClient();

  const people = await fetchPeople();
  if (people.length === 0) {
    throw new Error('Org chart returned no people — check ORG_CHART_API_KEY and the org-chart service.');
  }
  const active = people.filter(p => p.isActive !== false && p.isActive !== 0);

  // Index org-chart people by email (lower-case) and by normalised name for
  // a fast lookup loop.
  const byEmail = new Map<string, RawPerson>();
  const byName  = new Map<string, RawPerson>();
  for (const p of active) {
    if (p.email) byEmail.set(p.email.toLowerCase().trim(), p);
    byName.set(normalizeStr(p.name), p);
  }

  const { data: users, error } = await sb
    .from('users')
    .select('id, name, email, team')
    .eq('is_active', 1);
  if (error) throw new Error(`Failed to load users: ${error.message}`);

  const result: TeamSyncResult = {
    totalUsers: users?.length ?? 0,
    updated: 0, unchanged: 0, unmatched: 0, errors: 0,
    details: [],
  };

  for (const u of users ?? []) {
    const id    = Number(u.id);
    const name  = String(u.name ?? '');
    const email = String(u.email ?? '');
    const from  = (u.team as string | null) ?? null;

    // 1. Email exact, then name exact, then first+last token.
    let match: RawPerson | undefined;
    if (email) match = byEmail.get(email.toLowerCase().trim());
    if (!match && name) match = byName.get(normalizeStr(name));
    if (!match && name) match = active.find(p => firstLastMatch(p.name, name));

    if (!match) {
      result.unmatched += 1;
      result.details.push({ userId: id, name, email, status: 'unmatched', from, to: null });
      continue;
    }

    const to = mapOrgDeptToAppTeam(match.departmentName ?? '');

    if (from === to) {
      result.unchanged += 1;
      result.details.push({ userId: id, name, email, status: 'unchanged', from, to });
      continue;
    }

    if (opts?.dryRun) {
      result.updated += 1;
      result.details.push({ userId: id, name, email, status: 'updated', from, to });
      continue;
    }

    const { error: upErr } = await sb.from('users')
      .update({ team: to, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (upErr) {
      result.errors += 1;
      result.details.push({ userId: id, name, email, status: 'error', from, to, error: upErr.message });
    } else {
      result.updated += 1;
      result.details.push({ userId: id, name, email, status: 'updated', from, to });
    }
  }

  return result;
}
