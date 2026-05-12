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

async function fetchPeople(): Promise<RawPerson[]> {
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
  console.log(`[orgchart] ${active.length} active people; email="${email ?? ''}" name="${name ?? ''}"`);

  // 1. Email — exact, case-insensitive (works only if API returns email field)
  if (email) {
    const normEmail = email.toLowerCase().trim();
    const byEmail   = active.find(p => p.email?.toLowerCase().trim() === normEmail);
    if (byEmail) {
      console.log(`[orgchart] matched by email → ${byEmail.name}`);
      return buildOrgPerson(byEmail, active);
    }
  }

  // 2. Name — exact normalised
  if (name) {
    const normName = normalizeStr(name);
    const byExact  = active.find(p => normalizeStr(p.name) === normName);
    if (byExact) {
      console.log(`[orgchart] matched by exact name → ${byExact.name}`);
      return buildOrgPerson(byExact, active);
    }

    // 3. Name — first + last token (handles middle names, accents, suffixes)
    const byTokens = active.find(p => firstLastMatch(p.name, name));
    if (byTokens) {
      console.log(`[orgchart] matched by first+last tokens → ${byTokens.name}`);
      return buildOrgPerson(byTokens, active);
    }

    const sample = active.slice(0, 5).map(p => p.name).join(', ');
    console.log(`[orgchart] no match for "${name}". Sample: ${sample}`);
  }

  return null;
}

/** Convenience wrapper kept for backward compatibility. */
export async function lookupPersonByName(name: string): Promise<OrgPerson | null> {
  return lookupPerson({ name });
}
