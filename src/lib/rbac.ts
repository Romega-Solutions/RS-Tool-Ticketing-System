export type AppRole = 'ic' | 'lead' | 'admin';

export function normalizeRole(role: unknown): AppRole {
  const value = String(role || '').trim().toLowerCase();

  if (['admin', 'ceo', 'owner', 'superadmin'].includes(value)) {
    return 'admin';
  }

  if (['lead', 'team_lead', 'teamlead', 'manager', 'tl'].includes(value)) {
    return 'lead';
  }

  return 'ic';
}

export function canAccessReports(role: AppRole): boolean {
  return role === 'lead' || role === 'admin';
}

export function canAccessPath(pathname: string, role: AppRole): boolean {
  if (pathname.startsWith('/reports') || pathname.startsWith('/attendance')) {
    return canAccessReports(role);
  }

  if (
    pathname.startsWith('/dashboard')
    || pathname.startsWith('/my-tasks')
    || pathname.startsWith('/projects')
    || pathname.startsWith('/profile')
    || pathname === '/'
  ) {
    return true;
  }

  return true;
}

export function defaultLandingPath(role: AppRole): string {
  if (role === 'ic') return '/my-tasks';
  return '/dashboard';
}

export function roleLabel(role: AppRole): string {
  if (role === 'admin') return 'Admin';
  if (role === 'lead') return 'Lead';
  return 'IC';
}
