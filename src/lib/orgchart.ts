const ORG_CHART_BASE = 'https://tools.romega-solutions.com';

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
  reportsTo?: number | null;
  photoUrl?: string | null;
  email?: string | null;
  isActive: boolean;
};

type RawDepartment = {
  id: number;
  name: string;
  color?: string | null;
};

function resolvePhotoUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${ORG_CHART_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

const APP_DEPARTMENTS = [
  'AI & Technology',
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

async function apiFetch<T>(path: string): Promise<T | null> {
  const key = process.env.ORG_CHART_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${ORG_CHART_BASE}${path}`, {
      headers: { 'X-API-Key': key },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

function buildOrgPerson(match: RawPerson, active: RawPerson[], departments: RawDepartment[]): OrgPerson {
  const rawDept = departments.find(d => d.id === match.departmentId);
  const deptName = rawDept?.name ?? '';
  const manager = match.reportsTo ? active.find(p => p.id === match.reportsTo) : null;
  return {
    id: match.id,
    name: match.name,
    title: match.title,
    department: mapOrgDeptToAppTeam(deptName),
    departmentColor: rawDept?.color ?? null,
    reportsToName: manager?.name ?? null,
    photoUrl: resolvePhotoUrl(match.photoUrl),
    email: match.email ?? null,
  };
}

/**
 * Look up an org chart person by email (primary) then name (fallback).
 * Both are optional but at least one should be provided.
 * Returns null silently if the API is unreachable or no match found.
 */
export async function lookupPerson(opts: { email?: string; name?: string }): Promise<OrgPerson | null> {
  const { email, name } = opts;
  if (!email && (!name || name.trim().length < 2)) return null;

  const [people, departments] = await Promise.all([
    apiFetch<RawPerson[]>('/api/people'),
    apiFetch<RawDepartment[]>('/api/departments'),
  ]);

  if (!people || !departments) return null;

  const active = people.filter(p => p.isActive);

  // 1. Email — exact, case-insensitive (most reliable)
  if (email) {
    const normEmail = email.toLowerCase().trim();
    const byEmail = active.find(p => p.email?.toLowerCase().trim() === normEmail);
    if (byEmail) return buildOrgPerson(byEmail, active, departments);
  }

  // 2. Name — exact normalised
  if (name) {
    const normName = normalizeStr(name);
    const byExact = active.find(p => normalizeStr(p.name) === normName);
    if (byExact) return buildOrgPerson(byExact, active, departments);

    // 3. Name — first + last token (handles middle names, accents)
    const byTokens = active.find(p => firstLastMatch(p.name, name));
    if (byTokens) return buildOrgPerson(byTokens, active, departments);
  }

  return null;
}

/** Convenience wrapper kept for backward compatibility. */
export async function lookupPersonByName(name: string): Promise<OrgPerson | null> {
  return lookupPerson({ name });
}
