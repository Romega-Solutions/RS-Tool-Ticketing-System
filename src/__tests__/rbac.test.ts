import { describe, it, expect } from 'vitest';
import {
  normalizeRole,
  canAccessReports,
  canAccessAdmin,
  canAccessPath,
  defaultLandingPath,
  roleLabel,
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

describe('canAccessPath', () => {
  it('blocks /admin/* for non-admin', () => {
    expect(canAccessPath('/admin/users', 'ic')).toBe(false);
    expect(canAccessPath('/admin/users', 'lead')).toBe(false);
    expect(canAccessPath('/admin/users', 'admin')).toBe(true);
  });

  it('blocks /attendance/* for ic', () => {
    expect(canAccessPath('/attendance', 'ic')).toBe(false);
    expect(canAccessPath('/attendance', 'lead')).toBe(true);
    expect(canAccessPath('/attendance', 'admin')).toBe(true);
  });

  it('allows any other path for all roles', () => {
    expect(canAccessPath('/dashboard', 'ic')).toBe(true);
    expect(canAccessPath('/my-tasks', 'ic')).toBe(true);
    expect(canAccessPath('/profile', 'lead')).toBe(true);
  });
});

describe('defaultLandingPath', () => {
  it('sends ic to /my-tasks', () => {
    expect(defaultLandingPath('ic')).toBe('/my-tasks');
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
  });
});
