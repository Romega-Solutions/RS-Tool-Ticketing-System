import { describe, expect, it } from 'vitest';
import {
  buildOrgAuthProfile,
  isAllowedOrgAuthEmail,
  roleFromOrgTitle,
} from '@/lib/orgchart';

describe('org-chart SSO eligibility', () => {
  it('allows exact org-chart Romega and Gmail emails only', () => {
    expect(isAllowedOrgAuthEmail('ken@romega-solutions.com')).toBe(true);
    expect(isAllowedOrgAuthEmail('intern.romegasolutions@gmail.com')).toBe(true);
    expect(isAllowedOrgAuthEmail('person@yahoo.com')).toBe(false);
    expect(isAllowedOrgAuthEmail('')).toBe(false);
  });

  it('maps intern titles to the intern app role', () => {
    expect(roleFromOrgTitle('Marketing and Brand Content Intern')).toBe('intern');
    expect(roleFromOrgTitle('OJT - UI/UX')).toBe('intern');
    expect(roleFromOrgTitle('Account Executive Associate')).toBe('ic');
  });

  it('builds a login profile from an active org-chart intern with a Gmail address', () => {
    const profile = buildOrgAuthProfile({
      id: 31,
      name: 'Leighannah Bobis',
      title: 'Marketing and Brand Content Intern',
      departmentId: 5,
      departmentName: 'Marketing',
      departmentColor: '#d68910',
      reportsTo: 28,
      photoUrl: '/uploads/photos/leighannah.webp',
      email: 'lbobis.romegasolutions@gmail.com',
      isActive: true,
    });

    expect(profile).toEqual({
      email: 'lbobis.romegasolutions@gmail.com',
      name: 'Leighannah Bobis',
      role: 'intern',
      team: 'Marketing & Brand Content',
      jobTitle: 'Marketing and Brand Content Intern',
      username: 'lbobis_romegasolutions_gmail_com',
    });
  });

  it('rejects inactive org-chart people and unsupported email domains', () => {
    expect(buildOrgAuthProfile({
      id: 1,
      name: 'Inactive Intern',
      title: 'Intern',
      departmentId: 1,
      departmentName: 'Marketing',
      departmentColor: null,
      reportsTo: null,
      photoUrl: null,
      email: 'inactive.romegasolutions@gmail.com',
      isActive: false,
    })).toBeNull();

    expect(buildOrgAuthProfile({
      id: 2,
      name: 'Unsupported Domain',
      title: 'Intern',
      departmentId: 1,
      departmentName: 'Marketing',
      departmentColor: null,
      reportsTo: null,
      photoUrl: null,
      email: 'person@yahoo.com',
      isActive: true,
    })).toBeNull();
  });
});
