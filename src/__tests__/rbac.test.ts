import { describe, it, expect } from 'vitest';
import {
  normalizeRole,
  canAccessReports,
  canAccessAdmin,
  canAccessPath,
  hasToolAccess,
  defaultLandingPath,
  roleLabel,
  isHrTeam,
  canAccessCertificateCreator,
  canAccessDevTools,
  emailSignatureAccess,
} from '@/lib/rbac';

describe('normalizeRole', () => {
  it('maps admin aliases to admin', () => {
    expect(normalizeRole('admin')).toBe('admin');
    expect(normalizeRole('ceo')).toBe('admin');
    expect(normalizeRole('owner')).toBe('admin');
    expect(normalizeRole('superadmin')).toBe('admin');
    expect(normalizeRole('CEO')).toBe('admin');
    expect(normalizeRole('ADMIN')).toBe('admin');
  });

  it('maps lead aliases to lead', () => {
    expect(normalizeRole('lead')).toBe('lead');
    expect(normalizeRole('team_lead')).toBe('lead');
    expect(normalizeRole('teamlead')).toBe('lead');
    expect(normalizeRole('manager')).toBe('lead');
    expect(normalizeRole('tl')).toBe('lead');
    expect(normalizeRole('TL')).toBe('lead');
  });

  it('maps intern to intern (not ic)', () => {
    expect(normalizeRole('intern')).toBe('intern');
    expect(normalizeRole('Intern')).toBe('intern');
    expect(normalizeRole('  INTERN ')).toBe('intern');
  });

  it('falls back to ic for any unknown value', () => {
    expect(normalizeRole('ic')).toBe('ic');
    expect(normalizeRole('employee')).toBe('ic');
    expect(normalizeRole('')).toBe('ic');
    expect(normalizeRole(null)).toBe('ic');
    expect(normalizeRole(undefined)).toBe('ic');
    expect(normalizeRole(42)).toBe('ic');
  });
});

describe('canAccessReports', () => {
  it('allows lead and admin', () => {
    expect(canAccessReports('lead')).toBe(true);
    expect(canAccessReports('admin')).toBe(true);
  });

  it('blocks ic', () => {
    expect(canAccessReports('ic')).toBe(false);
  });
});

describe('canAccessAdmin', () => {
  it('allows only admin', () => {
    expect(canAccessAdmin('admin')).toBe(true);
    expect(canAccessAdmin('lead')).toBe(false);
    expect(canAccessAdmin('ic')).toBe(false);
  });
});

describe('hasToolAccess', () => {
  it('grants a tool only when it is in the user\'s tool_access set', () => {
    expect(hasToolAccess('sales', 'lead', ['sales'])).toBe(true);
    expect(hasToolAccess('sales', 'lead', ['marketing'])).toBe(false);
    expect(hasToolAccess('sales', 'ic', [])).toBe(false);
  });

  it('admins always have every tool regardless of the stored set', () => {
    expect(hasToolAccess('recruiting', 'admin', [])).toBe(true);
    expect(hasToolAccess('ceo', 'admin', [])).toBe(true);
  });

  it('treats a missing/invalid set as no access', () => {
    expect(hasToolAccess('projects', 'ic', null)).toBe(false);
    expect(hasToolAccess('projects', 'ic', undefined)).toBe(false);
  });
});

describe('canAccessPath', () => {
  it('blocks /admin/* and /rates for non-admin (role-based, not grantable)', () => {
    expect(canAccessPath('/admin/users', 'ic')).toBe(false);
    expect(canAccessPath('/admin/users', 'lead', ['projects', 'attendance'])).toBe(false);
    expect(canAccessPath('/admin/users', 'admin')).toBe(true);
    expect(canAccessPath('/rates', 'lead')).toBe(false);
    expect(canAccessPath('/rates', 'admin')).toBe(true);
  });

  it('gates the 8 tools by the per-user tool_access set', () => {
    expect(canAccessPath('/attendance', 'lead', [])).toBe(false);
    expect(canAccessPath('/attendance', 'lead', ['attendance'])).toBe(true);
    expect(canAccessPath('/attendance', 'admin', [])).toBe(true);            // admin bypass
    expect(canAccessPath('/sales/leads', 'ic', ['sales'])).toBe(true);
    expect(canAccessPath('/sales/leads', 'ic', [])).toBe(false);
    expect(canAccessPath('/projects', 'ic', ['projects'])).toBe(true);
    expect(canAccessPath('/projects', 'ic', [])).toBe(false);
  });

  it('allows any non-gated path for all roles', () => {
    expect(canAccessPath('/dashboard', 'ic')).toBe(true);
    expect(canAccessPath('/my-tasks', 'ic')).toBe(true);
    expect(canAccessPath('/profile', 'lead')).toBe(true);
  });
});

describe('defaultLandingPath', () => {
  it('sends ic and intern to /my-tasks', () => {
    expect(defaultLandingPath('ic')).toBe('/my-tasks');
    expect(defaultLandingPath('intern')).toBe('/my-tasks');
  });

  it('sends lead and admin to /dashboard', () => {
    expect(defaultLandingPath('lead')).toBe('/dashboard');
    expect(defaultLandingPath('admin')).toBe('/dashboard');
  });
});

describe('roleLabel', () => {
  it('returns correct display labels', () => {
    expect(roleLabel('admin')).toBe('Admin');
    expect(roleLabel('lead')).toBe('Lead');
    expect(roleLabel('ic')).toBe('IC');
    // Regression: an intern must render "Intern", never "IC".
    expect(roleLabel('intern')).toBe('Intern');
  });
});

describe('Tools hub gating', () => {
  it('isHrTeam matches hr/marketing and the exec/admin group, case-insensitively', () => {
    expect(isHrTeam('hr/marketing')).toBe(true);
    expect(isHrTeam('HR/Marketing')).toBe(true);
    expect(isHrTeam('Executive & Admin')).toBe(true);
    expect(isHrTeam('admin')).toBe(true);
    expect(isHrTeam('operations')).toBe(false);
    expect(isHrTeam(null)).toBe(false);
  });

  it('Certificate Creator is admin-or-HR only', () => {
    expect(canAccessCertificateCreator('admin', null)).toBe(true);
    expect(canAccessCertificateCreator('lead', 'hr/marketing')).toBe(true);
    expect(canAccessCertificateCreator('ic', 'hr/marketing')).toBe(true);
    expect(canAccessCertificateCreator('lead', 'operations')).toBe(false);
    expect(canAccessCertificateCreator('intern', null)).toBe(false);
  });

  it('Dev Tools are admins only', () => {
    expect(canAccessDevTools('admin')).toBe(true);
    expect(canAccessDevTools('lead')).toBe(false);
    expect(canAccessDevTools('ic')).toBe(false);
    expect(canAccessDevTools('intern')).toBe(false);
  });

  it('Email Signature access level: admin role → admin, HR team → editor, else visitor', () => {
    expect(emailSignatureAccess('admin', 'operations')).toBe('admin');
    expect(emailSignatureAccess('lead', 'hr/marketing')).toBe('editor');
    expect(emailSignatureAccess('ic', 'executive & admin')).toBe('editor');
    expect(emailSignatureAccess('ic', 'operations')).toBe('visitor');
    expect(emailSignatureAccess('intern', null)).toBe('visitor');
  });
});
