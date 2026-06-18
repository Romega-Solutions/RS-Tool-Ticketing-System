import { describe, it, expect } from 'vitest';
import { deriveUserPatchAction, describeAudit } from '@/lib/audit';

describe('deriveUserPatchAction', () => {
  it('detects deactivation', () => {
    expect(deriveUserPatchAction({ role: 'ic', is_active: 1 }, { role: 'ic', is_active: 0 }))
      .toEqual({ action: 'user.deactivated', details: {} });
  });
  it('detects reactivation', () => {
    expect(deriveUserPatchAction({ role: 'ic', is_active: 0 }, { role: 'ic', is_active: 1 }))
      .toEqual({ action: 'user.reactivated', details: {} });
  });
  it('detects role change with from/to', () => {
    expect(deriveUserPatchAction({ role: 'ic', is_active: 1 }, { role: 'lead', is_active: 1 }))
      .toEqual({ action: 'user.role_changed', details: { from: 'ic', to: 'lead' } });
  });
  it('falls back to a generic update', () => {
    expect(deriveUserPatchAction({ role: 'ic', is_active: 1 }, { role: 'ic', is_active: 1 }))
      .toEqual({ action: 'user.updated', details: {} });
  });
  it('prioritizes (de)activation over a simultaneous role change', () => {
    expect(deriveUserPatchAction({ role: 'ic', is_active: 1 }, { role: 'lead', is_active: 0 }).action)
      .toBe('user.deactivated');
  });
});

describe('describeAudit', () => {
  it('describes a role change with the transition', () => {
    expect(describeAudit('user.role_changed', { from: 'ic', to: 'lead' }))
      .toBe("Changed a user's role (ic → lead)");
  });
  it('describes account creation', () => {
    expect(describeAudit('user.created', null)).toBe('Created a user account');
  });
  it('handles unknown actions', () => {
    expect(describeAudit('user.frobnicated', null)).toBe('Admin action: user.frobnicated');
  });
});
