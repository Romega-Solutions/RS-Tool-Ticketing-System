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
  isActive: boolean | number;
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

async function apiFetch(path: string): Promise<unknown> {
  const key = process.env.ORG_CHART_API_KEY;
  if (!key) {
    console.error('[orgchart] ORG_CHART_API_KEY is not set');
    return null;
  }
  try {
    const res = await fetch(`${ORG_CHART_BASE}${path}`, {
      headers: { 'X-API-Key': key },
      cache: 'no-store',
    });
    if (!res.ok) {
      console.error(`[orgchart] ${path} → HTTP ${res.status}`);
      return null;
    }
    const json = await res.json() as unknown;
    return json;
  } catch (err) {
    console.error(`[orgchart] ${path} fetch error:`, err);
    return null;
  }
}

function unwrapArray<T>(raw: unknown): T[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'object') {
    // handle { people: [...] }, { departments: [...] }, { data: [...] }, etc.
    for (const key of ['people', 'departments', 'data', 'items', 'results']) {
      const val = (raw as Record<string, unknown>)[key];
      if (Array.isArray(val)) return val as T[];
    }
  }
  console.error('[orgchart] unexpected response shape:', JSON.stringify(raw).slice(0, 200));
  return [];
}

function buildOrgPerson(
  match: RawPerson,
  active: RawPerson[],
  departments: RawDepartment[],
): OrgPerson {
  const rawDept  = departments.find(d => d.id === match.departmentId);
  const deptName = rawDept?.name ?? '';
  const manager  = match.reportsTo ? active.find(p => p.id === match.reportsTo) : null;
  return {
    id:              match.id,
    name:            match.name,
    title:           match.title,
    department:      mapOrgDeptToAppTeam(deptName),
    departmentColor: rawDept?.color ?? null,
    reportsToName:   manager?.name ?? null,
    photoUrl:        resolvePhotoUrl(match.photoUrl),
    email:           match.email ?? null,
  };
}

/**
 * Look up an org chart person by email (primary) then name (fallback).
 * Email match requires the org chart list to include the email field.
 * Name matching uses exact → first+last token strategies.
 */
export async function lookupPerson(opts: { email?: string; name?: string }): Promise<OrgPerson | null> {
  const { email, name } = opts;
  if (!email && (!name || name.trim().length < 2)) return null;

  const [rawPeople, rawDepts] = await Promise.all([
    apiFetch('/api/people'),
    apiFetch('/api/departments'),
  ]);

  const people      = unwrapArray<RawPerson>(rawPeople);
  const departments = unwrapArray<RawDepartment>(rawDepts);

  if (!people.length) {
    console.error('[orgchart] /api/people returned empty or failed');
    return null;
  }

  const active = people.filter(p => p.isActive !== false && p.isActive !== 0);

  console.log(`[orgchart] ${active.length} active people fetched; searching email="${email ?? ''}" name="${name ?? ''}"`);

  // 1. Email — exact, case-insensitive
  if (email) {
    const normEmail = email.toLowerCase().trim();
    const byEmail   = active.find(p => p.email?.toLowerCase().trim() === normEmail);
    if (byEmail) {
      console.log(`[orgchart] matched by email → ${byEmail.name}`);
      return buildOrgPerson(byEmail, active, departments);
    }
    console.log('[orgchart] no email match found (field may not be in list response)');
  }

  // 2. Name — exact normalised
  if (name) {
    const normName = normalizeStr(name);
    const byExact  = active.find(p => normalizeStr(p.name) === normName);
    if (byExact) {
      console.log(`[orgchart] matched by exact name → ${byExact.name}`);
      return buildOrgPerson(byExact, active, departments);
    }

    // 3. Name — first + last token (handles middle names, accents, suffixes)
    const byTokens = active.find(p => firstLastMatch(p.name, name));
    if (byTokens) {
      console.log(`[orgchart] matched by first+last tokens → ${byTokens.name}`);
      return buildOrgPerson(byTokens, active, departments);
    }

    // Debug: show closest names to diagnose misses
    const sample = active.slice(0, 5).map(p => p.name).join(', ');
    console.log(`[orgchart] no name match for "${name}". Sample names: ${sample}`);
  }

  return null;
}

/** Convenience wrapper kept for backward compatibility. */
export async function lookupPersonByName(name: string): Promise<OrgPerson | null> {
  return lookupPerson({ name });
}
