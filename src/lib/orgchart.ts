const ORG_CHART_BASE = 'https://tools.romega-solutions.com';

export type OrgPerson = {
  id: number;
  name: string;
  title: string;
  department: string;
  photoUrl: string | null;
};

type RawPerson = {
  id: number;
  name: string;
  title: string;
  departmentId: number;
  photoUrl?: string | null;
  isActive: boolean;
};

type RawDepartment = {
  id: number;
  name: string;
};

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

export async function lookupPersonByName(name: string): Promise<OrgPerson | null> {
  if (!name || name.trim().length < 2) return null;

  const [people, departments] = await Promise.all([
    apiFetch<RawPerson[]>('/api/people'),
    apiFetch<RawDepartment[]>('/api/departments'),
  ]);

  if (!people || !departments) return null;

  const deptMap = new Map(departments.map(d => [d.id, d.name]));
  const active = people.filter(p => p.isActive);

  const normInput = normalizeStr(name);
  let match = active.find(p => normalizeStr(p.name) === normInput);

  if (!match) {
    match = active.find(p => firstLastMatch(p.name, name));
  }

  if (!match) return null;

  const deptName = deptMap.get(match.departmentId) ?? '';
  return {
    id: match.id,
    name: match.name,
    title: match.title,
    department: mapOrgDeptToAppTeam(deptName),
    photoUrl: match.photoUrl ?? null,
  };
}
