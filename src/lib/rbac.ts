export type AppRole = 'intern' | 'ic' | 'lead' | 'admin';
export type LeadToolKey = 'ceo' | 'pm' | 'sales' | 'marketing' | 'recruiting' | 'onboarding';

// ── Per-user tool access (checkbox-driven) ───────────────────────────────────
// The canonical list of tools an admin can grant/revoke per user from the
// Tool Access matrix in User Management. Each user stores an array of these
// keys in users.tool_access; access = membership in that array (admins bypass).
// Sensitive admin tools (/admin/*, /rates, overtime, manage-learning, dev tools)
// are intentionally NOT here — they stay strictly admin-role only.
export type GateableToolKey =
  | 'projects' | 'attendance' | 'recruiting' | 'sales'
  | 'marketing' | 'pm' | 'ceo' | 'onboarding';

export const GATEABLE_TOOLS: ReadonlyArray<{
  key: GateableToolKey;
  label: string;
  prefixes: string[];   // path prefixes this tool guards
}> = [
  { key: 'projects',   label: 'Projects',         prefixes: ['/projects'] },
  { key: 'attendance', label: 'Attendance',       prefixes: ['/attendance'] },   // /attendance + /attendance/requests
  { key: 'recruiting', label: 'Recruiting (ATS)', prefixes: ['/recruiting'] },
  { key: 'sales',      label: 'Sales',            prefixes: ['/sales'] },
  { key: 'marketing',  label: 'Marketing',        prefixes: ['/marketing'] },
  { key: 'pm',         label: 'PM',               prefixes: ['/pm'] },
  { key: 'ceo',        label: 'CEO Briefing',     prefixes: ['/ceo'] },
  { key: 'onboarding', label: 'Onboarding',       prefixes: ['/onboarders'] },
];

export const GATEABLE_TOOL_KEYS: GateableToolKey[] = GATEABLE_TOOLS.map((t) => t.key);

export function isGateableToolKey(value: unknown): value is GateableToolKey {
  return typeof value === 'string' && (GATEABLE_TOOL_KEYS as string[]).includes(value);
}

// Runtime gate: does this user have the tool ticked? Admins always do.
export function hasToolAccess(
  tool: GateableToolKey,
  role: AppRole,
  toolAccess: string[] | null | undefined,
): boolean {
  if (role === 'admin') return true;                       // admins bypass = all tools
  return Array.isArray(toolAccess) && toolAccess.includes(tool);
}

// Default Access: which tool(s) a department's members get out of the box.
// Used to pre-fill tool_access when a user is created (admins can adjust after).
// Keyed by the canonical department names (lowercased); a couple of aliases are
// included for robustness against older team strings.
const DEPARTMENT_TOOLS: Record<string, GateableToolKey[]> = {
  'executive':       ['ceo'],
  'finance':         [],
  'human resource':  ['recruiting', 'onboarding'],
  'human resources': ['recruiting', 'onboarding'],
  'marketing':       ['marketing'],
  'sales':           ['sales'],
  'technical':       ['pm'],
};

// Compute the day-one tool set for a new user from role + department:
//   IC / Intern → Projects + their department's tool(s)
//   Lead        → the above + Attendance (team overview)
//   Admin       → everything (they bypass at runtime anyway)
export function defaultToolAccess(role: AppRole, team: string | null): GateableToolKey[] {
  if (role === 'admin') return [...GATEABLE_TOOL_KEYS];
  const set = new Set<GateableToolKey>(['projects']);      // everyone gets Projects
  for (const t of DEPARTMENT_TOOLS[String(team ?? '').trim().toLowerCase()] ?? []) set.add(t);
  if (role === 'lead') set.add('attendance');              // leads get the team overview
  return [...set];
}

export function normalizeRole(role: unknown): AppRole {
  const value = String(role || '').trim().toLowerCase();

  if (['admin', 'ceo', 'owner', 'superadmin'].includes(value)) {
    return 'admin';
  }

  if (['lead', 'team_lead', 'teamlead', 'manager', 'tl', 'ic_lead', 'iclead'].includes(value)) {
    return 'lead';
  }

  if (value === 'intern') {
    return 'intern';
  }

  return 'ic';
}

export function canAccessReports(role: AppRole): boolean {
  return role === 'lead' || role === 'admin';
}

export function canAccessAdmin(role: AppRole): boolean {
  return role === 'admin';
}

// NOTE: as of the per-user Tool Access feature, this team-based gate is used
// ONLY to compute each user's day-one seed (scripts/seed-tool-access.ts).
// Runtime access is decided by hasToolAccess() against users.tool_access.
export function canAccessLeadTool(tool: LeadToolKey, role: AppRole, team: string | null): boolean {
  // Admins see every tool; a lead sees a tool only if their team is in that
  // tool's allowlist. The Onboarding Lead keeps access via the 'hr' / 'human
  // resources' / 'people' entries under `onboarding`.
  //
  // Recruiting is the one exception to "leads only": ICs on a core recruiting/HR
  // team also get it (RECRUITING_IC_TEAMS), since hands-on ATS work isn't limited
  // to leads. Interns are still excluded.
  const normalizeTeamName = (value: string | null | undefined) => String(value ?? '').trim().toLowerCase();
  const LEAD_TOOL_TEAMS: Record<LeadToolKey, string[]> = {
    ceo: ['executive', 'executive & admin', 'admin'],
    pm: ['operations', 'project management', 'design/pm'],
    sales: ['sales', 'sales & account management'],
    marketing: ['marketing', 'marketing & brand content', 'hr/marketing'],
    recruiting: [
      'recruiting', 'talent acquisition', 'people operations', 'operations',
      'hr', 'human resources', 'people', 'hr/marketing', 'marketing & brand content',
    ],
    onboarding: [
      'recruiting', 'talent acquisition', 'people operations', 'operations',
      'hr', 'human resources', 'people', 'hr/marketing',
      'executive', 'executive & admin', 'admin',
    ],
  };
  // ICs on a core recruiting/HR team get the Recruiting tool too (not other lead tools).
  const RECRUITING_IC_TEAMS = ['recruiting', 'talent acquisition', 'people operations', 'hr', 'human resources', 'people'];
  if (role === 'admin') return true;
  if (tool === 'recruiting' && role === 'ic') {
    return RECRUITING_IC_TEAMS.includes(normalizeTeamName(team));
  }
  if (role !== 'lead') return false;
  return LEAD_TOOL_TEAMS[tool].includes(normalizeTeamName(team));
}

// ── Romega Tools hub (external app launchers) ────────────────────────────────
// "HR" for tool-gating purposes = the people/HR team plus the exec/admin group.
const HR_TEAMS = ['hr/marketing', 'executive & admin', 'admin'];

export function isHrTeam(team: string | null): boolean {
  return HR_TEAMS.includes(String(team ?? '').trim().toLowerCase());
}

// Certificate Creator is HR-only for now (admins always included).
export function canAccessCertificateCreator(role: AppRole, team: string | null): boolean {
  return role === 'admin' || isHrTeam(team);
}

// Development Tools (GitHub/Vercel/Figma) — admins only for now.
export function canAccessDevTools(role: AppRole): boolean {
  return role === 'admin';
}

export type SignatureAccess = 'admin' | 'editor' | 'visitor';

// Email Signature is open to everyone, but at three permission levels:
// admin role → Admin, HR team → Editor, everyone else → Visitor.
export function emailSignatureAccess(role: AppRole, team: string | null): SignatureAccess {
  if (role === 'admin') return 'admin';
  if (isHrTeam(team)) return 'editor';
  return 'visitor';
}

export function canAccessPath(pathname: string, role: AppRole, toolAccess: string[] = []): boolean {
  // /admin/* (including /admin/learning) and /rates stay strictly admin-only.
  // /learning and /learning/certificates are open to all signed-in users.
  if (pathname.startsWith('/admin')) return canAccessAdmin(role);
  if (pathname.startsWith('/rates')) return canAccessAdmin(role);
  // The 8 checkbox-gated tools: access is per-user (users.tool_access).
  for (const tool of GATEABLE_TOOLS) {
    if (tool.prefixes.some((p) => pathname.startsWith(p))) {
      return hasToolAccess(tool.key, role, toolAccess);
    }
  }
  return true;
}

export function defaultLandingPath(role: AppRole): string {
  if (role === 'ic' || role === 'intern') return '/my-tasks';
  return '/dashboard';
}

export function roleLabel(role: AppRole): string {
  if (role === 'admin')  return 'Admin';
  if (role === 'lead')   return 'Lead';
  if (role === 'intern') return 'Intern';
  return 'IC';
}
