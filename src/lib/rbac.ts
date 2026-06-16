export type AppRole = 'intern' | 'ic' | 'lead' | 'admin';
export type LeadToolKey = 'ceo' | 'pm' | 'sales' | 'marketing' | 'recruiting' | 'onboarding';

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

export function canAccessLeadTool(tool: LeadToolKey, role: AppRole, team: string | null): boolean {
  // Admins see every tool; ICs/interns see none; a lead sees a tool only if their
  // team is in that tool's allowlist. The Onboarding Lead keeps access via the
  // 'hr' / 'human resources' / 'people' entries under `onboarding`.
  const normalizeTeamName = (value: string | null | undefined) => String(value ?? '').trim().toLowerCase();
  const LEAD_TOOL_TEAMS: Record<LeadToolKey, string[]> = {
    ceo: ['executive', 'executive & admin', 'admin'],
    pm: ['operations', 'project management', 'design/pm'],
    sales: ['sales', 'sales & account management'],
    marketing: ['marketing', 'marketing & brand content', 'hr/marketing'],
    recruiting: ['recruiting', 'talent acquisition', 'people operations', 'operations', 'hr/marketing', 'marketing & brand content'],
    onboarding: [
      'recruiting', 'talent acquisition', 'people operations', 'operations',
      'hr', 'human resources', 'people', 'hr/marketing',
      'executive', 'executive & admin', 'admin',
    ],
  };
  if (role === 'admin') return true;
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

export function canAccessPath(pathname: string, role: AppRole, team: string | null = null): boolean {
  // /admin/* (including /admin/learning) is admin-only. /learning and
  // /learning/certificates are open to all signed-in users.
  if (pathname.startsWith('/admin'))      return canAccessAdmin(role);
  if (pathname.startsWith('/rates'))      return canAccessAdmin(role);
  if (pathname.startsWith('/attendance')) return canAccessReports(role);
  if (pathname.startsWith('/ceo/'))       return canAccessLeadTool('ceo', role, team);
  if (pathname.startsWith('/pm/'))        return canAccessLeadTool('pm', role, team);
  if (pathname.startsWith('/sales/'))     return canAccessLeadTool('sales', role, team);
  if (pathname.startsWith('/marketing/')) return canAccessLeadTool('marketing', role, team);
  if (pathname.startsWith('/recruiting/')) return canAccessLeadTool('recruiting', role, team);
  if (pathname.startsWith('/onboarders'))  return canAccessLeadTool('onboarding', role, team);
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
