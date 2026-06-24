import { describe, it, expect } from 'vitest';
import { projectCaps, normalizeProjectRole } from '@/lib/permissions';

describe('projectCaps', () => {
  it('lead can do everything', () => {
    expect(projectCaps('lead')).toEqual({
      canView: true, canComment: true, canCreateItem: true, canEditItem: true,
      canEditDates: true, canEditAssignees: true, canArchiveItem: true, canManage: true,
    });
  });

  it('member edits items but NOT due date, assignees, or settings', () => {
    expect(projectCaps('member')).toEqual({
      canView: true, canComment: true, canCreateItem: true, canEditItem: true,
      canEditDates: false, canEditAssignees: false, canArchiveItem: false, canManage: false,
    });
  });

  it('viewer can only view + comment', () => {
    expect(projectCaps('viewer')).toEqual({
      canView: true, canComment: true, canCreateItem: false, canEditItem: false,
      canEditDates: false, canEditAssignees: false, canArchiveItem: false, canManage: false,
    });
  });

  it('no role (non-member) gets nothing', () => {
    expect(projectCaps(null)).toEqual({
      canView: false, canComment: false, canCreateItem: false, canEditItem: false,
      canEditDates: false, canEditAssignees: false, canArchiveItem: false, canManage: false,
    });
  });

  it('only leads may change due date + assignees (the Member rule)', () => {
    expect(projectCaps('member').canEditDates).toBe(false);
    expect(projectCaps('member').canEditAssignees).toBe(false);
    expect(projectCaps('lead').canEditDates).toBe(true);
    expect(projectCaps('lead').canEditAssignees).toBe(true);
  });

  it('only leads may manage project settings', () => {
    expect(projectCaps('viewer').canManage).toBe(false);
    expect(projectCaps('member').canManage).toBe(false);
    expect(projectCaps('lead').canManage).toBe(true);
  });
});

describe('normalizeProjectRole', () => {
  it('recognises the three roles case-insensitively', () => {
    expect(normalizeProjectRole('lead')).toBe('lead');
    expect(normalizeProjectRole('LEAD')).toBe('lead');
    expect(normalizeProjectRole('viewer')).toBe('viewer');
    expect(normalizeProjectRole(' Member ')).toBe('member');
  });

  it('defaults unknown / empty values to member', () => {
    expect(normalizeProjectRole('owner')).toBe('member');
    expect(normalizeProjectRole('')).toBe('member');
    expect(normalizeProjectRole(null)).toBe('member');
    expect(normalizeProjectRole(undefined)).toBe('member');
  });
});
