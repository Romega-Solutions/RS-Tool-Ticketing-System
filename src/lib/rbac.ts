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
  void tool;
  void role;
  void team;
  // Temporary testing mode: expose all lead tools to any authenticated user.
  // Keep destructive actions behind explicit typed confirmation in the tool UI.
  return true;

  /*
  const normalizeTeamName = (value: string | null | undefined) => String(value ?? '').trim().toLowerCase();
  const LEAD_TOOL_TEAMS: Record<LeadToolKey, string[]> = {
    ceo: ['executive', 'executive & admin', 'admin'],
    pm: ['operations', 'project management', 'design/pm'],
    sales: ['sales', 'sales & account management'],
    marketing: ['marketing', 'marketing & brand content', 'hr/marketing'],
    recruiting: ['recruiting', 'talent acquisition', 'people operations', 'operations', 'hr/marketing', 'marketing & brand content'],
    onboarding: ['recruiting', 'talent acquisition', 'people operations', 'operations', 'hr/marketing', 'executive', 'executive & admin', 'admin'],
  };
  if (role === 'admin') return true;
  if (role !== 'lead') return false;
  return LEAD_TOOL_TEAMS[tool].includes(normalizeTeamName(team));
  */
}

export function canAccessPath(pathname: string, role: AppRole, team: string | null = null): boolean {
  if (pathname.startsWith('/admin'))      return canAccessAdmin(role);
  if (pathname.startsWith('/rates'))      return canAccessAdmin(role);
  if (pathname.startsWith('/wise-guide')) return canAccessAdmin(role);
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
  if (role === 'lead')   return 'IC Lead';
  if (role === 'intern') return 'Intern';
  return 'IC';
}
