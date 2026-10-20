import { describe, it, expect } from 'vitest';
import {
  deriveUserPatchAction, describeAudit, diffFields, buildUserPatchAudit, diffReporting,
  auditFieldChanges, presentAuditChanges,
} from '@/lib/audit';

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
    expect(describeAudit('user.role_changed', { from: 'admin', to: 'intern' }))
      .toBe("Changed a user's role (Admin → Intern)");
    expect(describeAudit('user.role_changed', { from: 'ic', to: 'lead' }))
      .toBe("Changed a user's role (IC → Lead)");
  });
  it('describes account creation', () => {
    expect(describeAudit('user.created', null)).toBe('Created a user account');
  });
  it('describes identity changes by field', () => {
    expect(describeAudit('user.identity_changed', {
      email: { from: 'a@gmail.com', to: 'a@romega-solutions.com' },
      jobTitle: { from: 'Intern', to: 'Analyst' },
    })).toBe("Changed a user's email, job title");
  });
  it('handles unknown actions', () => {
    expect(describeAudit('user.frobnicated', null)).toBe('Admin action: user.frobnicated');
  });
});

describe('describeAudit (reporting, photo, field updates)', () => {
  it('describes reporting-line and photo changes', () => {
    expect(describeAudit('user.reporting_changed', { changes: { reportsTo: { from: null, to: 5 } } }))
      .toBe("Changed a user's reporting line");
    expect(describeAudit('user.photo_changed', null)).toBe("Changed a user's photo");
  });
  it('names the updated fields without their values', () => {
    expect(describeAudit('user.updated', {
      changes: { team: { from: 'A', to: 'B' }, hourlyRateUsd: { from: 5, to: 6 } },
    })).toBe("Updated a user's team, hourly rate");
    expect(describeAudit('user.updated', {})).toBe('Updated a user account');
  });
});

describe('diffFields', () => {
  it('returns only fields whose value changed', () => {
    expect(diffFields({ a: 1, b: 'x', c: null }, { a: 1, b: 'y', c: null }, ['a', 'b', 'c']))
      .toEqual({ b: { from: 'x', to: 'y' } });
  });
  it('treats null, undefined and empty string as the same empty value', () => {
    expect(diffFields({ a: null, b: undefined }, { a: '', b: null }, ['a', 'b'])).toEqual({});
    expect(diffFields({ a: null }, { a: 'Eng' }, ['a'])).toEqual({ a: { from: null, to: 'Eng' } });
  });
  it('compares arrays as sets', () => {
    expect(diffFields({ a: [1, 2] }, { a: [2, 1] }, ['a'])).toEqual({});
    expect(diffFields({ a: [1] }, { a: [1, 3] }, ['a'])).toEqual({ a: { from: [1], to: [1, 3] } });
  });
});

describe('buildUserPatchAudit', () => {
  const base = {
    role: 'ic', is_active: 1, team: 'Eng', member_code: null, hourly_rate_usd: 5, date_of_birth: '2000-01-01',
    start_date: null, end_date: null, drive_url: null, approved_hours_per_week: 15,
    schedule_pht_start: null, schedule_pht_end: null,
  };
  it('returns null when nothing actually changed', () => {
    expect(buildUserPatchAudit(base, { ...base })).toBeNull();
  });
  it('records before/after per changed field on a generic update', () => {
    expect(buildUserPatchAudit(base, { ...base, team: 'Ops', hourly_rate_usd: 6 })).toEqual({
      action: 'user.updated',
      details: { changes: { team: { from: 'Eng', to: 'Ops' }, hourlyRateUsd: { from: 5, to: 6 } } },
    });
  });
  it('keeps the role from/to and adds the field changes', () => {
    expect(buildUserPatchAudit(base, { ...base, role: 'lead', team: 'Ops' })).toEqual({
      action: 'user.role_changed',
      details: { from: 'ic', to: 'lead', changes: { role: { from: 'ic', to: 'lead' }, team: { from: 'Eng', to: 'Ops' } } },
    });
  });
  it('uses the deactivation action and records the status change', () => {
    const r = buildUserPatchAudit(base, { ...base, is_active: 0 });
    expect(r?.action).toBe('user.deactivated');
    expect(r?.details.changes).toEqual({ isActive: { from: 1, to: 0 } });
  });
});

describe('diffReporting', () => {
  const before = { reportsToUserId: 2, alsoReportsToUserIds: [3, 4], isHidden: false };
  it('returns null when nothing changed (order of "also reports to" ignored)', () => {
    expect(diffReporting(before, { reportsToUserId: 2, alsoReportsToUserIds: [4, 3] })).toBeNull();
    expect(diffReporting(before, { ...before, isHidden: false })).toBeNull();
  });
  it('records a main lead change', () => {
    expect(diffReporting(before, { ...before, reportsToUserId: null }))
      .toEqual({ reportsTo: { from: 2, to: null } });
  });
  it('records "also reports to" changes, with empty lists as []', () => {
    expect(diffReporting(before, { ...before, alsoReportsToUserIds: [] }))
      .toEqual({ alsoReportsTo: { from: [3, 4], to: [] } });
    expect(diffReporting({ reportsToUserId: null, alsoReportsToUserIds: [] }, { reportsToUserId: null, alsoReportsToUserIds: [7] }))
      .toEqual({ alsoReportsTo: { from: [], to: [7] } });
  });
  it('records an org-chart visibility change only when it was sent', () => {
    expect(diffReporting(before, { ...before, isHidden: true })).toEqual({ orgChartHidden: { from: false, to: true } });
    expect(diffReporting({ ...before, isHidden: true }, { reportsToUserId: 2, alsoReportsToUserIds: [3, 4] })).toBeNull();
  });
});

describe('auditFieldChanges', () => {
  it('reads every legacy details shape', () => {
    expect(auditFieldChanges('user.role_changed', { from: 'ic', to: 'lead' })).toEqual({ role: { from: 'ic', to: 'lead' } });
    expect(auditFieldChanges('user.created', { role: 'intern', team: 'Eng' }))
      .toEqual({ role: { from: null, to: 'intern' }, team: { from: null, to: 'Eng' } });
    expect(auditFieldChanges('user.tool_access_changed', { added: ['pm'], removed: ['sales'] }))
      .toEqual({ toolsAdded: { from: null, to: ['pm'] }, toolsRemoved: { from: ['sales'], to: null } });
    expect(auditFieldChanges('user.identity_changed', { name: { from: 'A', to: 'B' } })).toEqual({ name: { from: 'A', to: 'B' } });
    expect(auditFieldChanges('user.updated', null)).toEqual({});
  });
});

describe('presentAuditChanges (server-side masking)', () => {
  const names: Record<number, string> = { 2: 'Ken Lee', 3: 'Ana Cruz', 4: 'Bo Diaz' };
  const nameOf = (id: number) => names[id] ?? null;

  it('strips private values (email, rate, birth date) so they are never serialized', () => {
    const out = presentAuditChanges('user.updated', {
      changes: {
        hourlyRateUsd: { from: 5, to: 6 },
        dateOfBirth: { from: '2000-01-01', to: '2000-02-02' },
        team: { from: 'Eng', to: 'Ops' },
      },
    });
    expect(out).toEqual([
      { field: 'hourlyRateUsd', label: 'Hourly rate', from: null, to: null, hidden: 'private' },
      { field: 'dateOfBirth', label: 'Birth date', from: null, to: null, hidden: 'private' },
      { field: 'team', label: 'Team', from: 'Eng', to: 'Ops' },
    ]);
    const json = JSON.stringify(out);
    expect(json).not.toContain('2000-01-01');
    expect(json).not.toContain('2000-02-02');
  });

  it('masks a legacy identity email change too', () => {
    const out = presentAuditChanges('user.identity_changed', {
      email: { from: 'old@gmail.com', to: 'new@romega-solutions.com' },
      jobTitle: { from: 'Intern', to: 'Analyst' },
    });
    expect(out).toEqual([
      { field: 'email', label: 'Email', from: null, to: null, hidden: 'private' },
      { field: 'jobTitle', label: 'Job title', from: 'Intern', to: 'Analyst' },
    ]);
    expect(JSON.stringify(out)).not.toContain('@');
  });

  it('only says a photo changed, with no image path or URL', () => {
    const out = presentAuditChanges('user.photo_changed', { path: 'users/9/photo.png' });
    expect(out).toEqual([{ field: 'photo', label: 'Photo', from: null, to: null, hidden: 'value' }]);
    expect(JSON.stringify(out)).not.toContain('photo.png');
  });

  it('resolves reporting-line user ids to names, with the founder as the default lead', () => {
    expect(presentAuditChanges('user.reporting_changed', {
      changes: {
        reportsTo: { from: null, to: 2 },
        alsoReportsTo: { from: [3], to: [3, 4, 99] },
        orgChartHidden: { from: false, to: true },
      },
    }, nameOf)).toEqual([
      { field: 'reportsTo', label: 'Main lead', from: 'Founder (default)', to: 'Ken Lee' },
      { field: 'alsoReportsTo', label: 'Also reports to', from: 'Ana Cruz', to: 'Ana Cruz, Bo Diaz, User #99' },
      { field: 'orgChartHidden', label: 'Hidden on org chart', from: 'No', to: 'Yes' },
    ]);
  });

  it('formats roles and status for display', () => {
    expect(presentAuditChanges('user.deactivated', {
      changes: { isActive: { from: 1, to: 0 }, role: { from: 'ceo', to: 'intern' } },
    })).toEqual([
      { field: 'isActive', label: 'Status', from: 'Active', to: 'Inactive' },
      { field: 'role', label: 'Role', from: 'Founder', to: 'Intern' },
    ]);
  });
});
