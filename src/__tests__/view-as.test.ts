import { describe, it, expect } from 'vitest';
import { canViewAs } from '@/lib/session';

const row = (over: Partial<Parameters<typeof canViewAs>[1]> = {}) => ({
  id: 2, email: 'ic@x.com', name: 'IC', username: 'ic', role: 'ic',
  team: null, job_title: null, is_active: 1, is_onboarding: 0, tool_access: [],
  ...over,
});

describe('canViewAs', () => {
  const admin = { id: 1, role: 'admin' as const };

  it('lets an admin view as an active non-admin', () => {
    expect(canViewAs(admin, row())).toBe(true);
    expect(canViewAs(admin, row({ role: 'tl' }))).toBe(true);
  });

  it('refuses non-admin viewers', () => {
    expect(canViewAs({ id: 1, role: 'lead' }, row())).toBe(false);
    expect(canViewAs({ id: 1, role: 'ic' }, row())).toBe(false);
  });

  it('refuses admin targets, including role aliases', () => {
    expect(canViewAs(admin, row({ role: 'admin' }))).toBe(false);
    expect(canViewAs(admin, row({ role: 'owner' }))).toBe(false);
  });

  it('refuses inactive targets and self', () => {
    expect(canViewAs(admin, row({ is_active: 0 }))).toBe(false);
    expect(canViewAs(admin, row({ id: 1 }))).toBe(false);
  });
});
