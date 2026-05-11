export type AppRole = 'intern' | 'ic' | 'lead' | 'admin';

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

export function canAccessPath(pathname: string, role: AppRole): boolean {
  if (pathname.startsWith('/admin'))      return canAccessAdmin(role);
  if (pathname.startsWith('/attendance')) return canAccessReports(role);
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
