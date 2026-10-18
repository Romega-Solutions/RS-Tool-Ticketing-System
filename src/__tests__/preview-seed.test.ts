import { describe, expect, it } from 'vitest';
import { checkTarget, isSeedEmail, jwtRef, PRODUCTION_SUPABASE_REF, supabaseRef } from '../../scripts/preview-seed/guards';
import { buildFakeDataset, TEST_ACCOUNTS, type Structure } from '../../scripts/preview-seed/dataset';
import { parseArgs } from '../../scripts/preview-seed/index';

const DEV_REF = 'cgstmdpbzjuwwoudfeqk';
const DEV_URL = `https://${DEV_REF}.supabase.co`;
const PROD_URL = `https://${PRODUCTION_SUPABASE_REF}.supabase.co`;

function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256' })}.${b64(payload)}.sig`;
}

describe('preview seed target guards', () => {
  const ok = { targetFlag: DEV_REF, targetUrl: DEV_URL, targetKey: 'sb_secret_x', sourceUrl: PROD_URL };

  it('accepts a non-production target that matches --target', () => {
    expect(checkTarget(ok)).toEqual({ ok: true, ref: DEV_REF, url: DEV_URL });
  });

  it('requires an explicit --target flag', () => {
    expect(checkTarget({ ...ok, targetFlag: undefined }).ok).toBe(false);
    expect(checkTarget({ ...ok, targetFlag: '' }).ok).toBe(false);
  });

  it('refuses production as the target, by flag, URL or key', () => {
    expect(checkTarget({ ...ok, targetFlag: PRODUCTION_SUPABASE_REF, targetUrl: PROD_URL, sourceUrl: undefined }).ok).toBe(false);
    expect(checkTarget({ ...ok, targetUrl: PROD_URL }).ok).toBe(false);
    expect(checkTarget({ ...ok, targetKey: jwt({ ref: PRODUCTION_SUPABASE_REF }) }).ok).toBe(false);
  });

  it('refuses a --target that does not match the URL', () => {
    const res = checkTarget({ ...ok, targetFlag: 'aaaaaaaaaaaaaaaaaaaa' });
    expect(res).toMatchObject({ ok: false });
  });

  it('refuses a key from a different project', () => {
    expect(checkTarget({ ...ok, targetKey: jwt({ ref: 'bbbbbbbbbbbbbbbbbbbb' }) }).ok).toBe(false);
  });

  it('refuses when the target is the source', () => {
    expect(checkTarget({ ...ok, sourceUrl: DEV_URL }).ok).toBe(false);
  });

  it('refuses missing URL or key', () => {
    expect(checkTarget({ ...ok, targetUrl: undefined }).ok).toBe(false);
    expect(checkTarget({ ...ok, targetKey: '  ' }).ok).toBe(false);
  });

  it('parses refs and keys', () => {
    expect(supabaseRef(DEV_URL)).toBe(DEV_REF);
    expect(supabaseRef(DEV_REF)).toBe(DEV_REF);
    expect(supabaseRef('https://example.com')).toBeNull();
    expect(jwtRef(jwt({ ref: DEV_REF }))).toBe(DEV_REF);
    expect(jwtRef('sb_secret_abc')).toBeNull();
    expect(isSeedEmail('x@preview.invalid')).toBe(true);
    expect(isSeedEmail('x@romega-solutions.com')).toBe(false);
  });

  it('rejects unknown CLI options and flags without values', () => {
    expect(parseArgs(['--target', DEV_REF, '--dry-run'])).toMatchObject({ target: DEV_REF, dryRun: true });
    expect(() => parseArgs(['--target'])).toThrow();
    expect(() => parseArgs(['--target', '--dry-run'])).toThrow();
    expect(() => parseArgs(['--force'])).toThrow();
  });
});

const structure: Structure = {
  users: [
    { id: 1, role: 'founder', team: 'Management', isActive: true, isOnboarding: false, toolAccess: [], approvedHours: 40 },
    { id: 2, role: 'admin', team: 'Technical', isActive: true, isOnboarding: false, toolAccess: [], approvedHours: 40 },
    { id: 3, role: 'lead', team: 'Sales', isActive: true, isOnboarding: false, toolAccess: ['sales'], approvedHours: 20 },
    { id: 4, role: 'ic', team: 'Sales', isActive: true, isOnboarding: false, toolAccess: ['sales'], approvedHours: 20 },
    { id: 5, role: 'intern', team: 'Sales', isActive: false, isOnboarding: false, toolAccess: [], approvedHours: null },
    { id: 6, role: 'ic', team: 'HR', isActive: true, isOnboarding: true, toolAccess: ['recruiting'], approvedHours: 15 },
  ],
  reporting: [
    { userId: 3, reportsTo: 1, displayOrder: 0, isHidden: false },
    { userId: 4, reportsTo: 3, displayOrder: 1, isHidden: false },
    { userId: 5, reportsTo: 4, displayOrder: 0, isHidden: true },
  ],
  secondary: [{ userId: 6, alsoReportsTo: 3 }],
  departments: [{ name: 'Sales', color: null, displayOrder: 3 }, { name: 'Technical', color: '#000', displayOrder: 1 }],
  projects: [{ id: 10, team: 'Sales', archived: false, network: 2 }, { id: 11, team: null, archived: true, network: 2 }],
  states: [
    { id: 100, projectId: 10, name: 'Todo', color: '#ccc', group: 'unstarted', sequence: 1, isDefault: true },
    { id: 101, projectId: 10, name: 'Done', color: '#0f0', group: 'completed', sequence: 2, isDefault: true },
  ],
  members: [{ projectId: 10, userId: 3, role: 'admin' }, { projectId: 10, userId: 99, role: 'member' }],
  workItems: [
    { id: 1000, projectId: 10, stateId: 100, parentId: null, archived: false, priority: 'high', createdBy: 3 },
    { id: 1001, projectId: 10, stateId: 101, parentId: 1000, archived: false, priority: 'none', createdBy: 4 },
    { id: 1002, projectId: 11, stateId: null, parentId: null, archived: true, priority: 'low', createdBy: null },
  ],
  assignees: [{ workItemId: 1000, userId: 4 }, { workItemId: 1001, userId: 99 }],
  positions: [{ isOpen: true, employmentType: 'part_time', placementType: 'internal', openings: 1 }],
};

const now = new Date('2026-10-18T08:00:00Z');

describe('buildFakeDataset', () => {
  const data = buildFakeDataset(structure, { now });

  it('uses only fake @preview.invalid identities and no personal fields', () => {
    for (const u of data.users) {
      expect(u.email.endsWith('@preview.invalid')).toBe(true);
      expect(u.hourlyRateUsd === null || u.hourlyRateUsd === 9.99).toBe(true);
      expect(u).not.toHaveProperty('dateOfBirth');
    }
    expect(new Set(data.users.map((u) => u.email)).size).toBe(data.users.length);
    expect(new Set(data.users.map((u) => u.username)).size).toBe(data.users.length);
  });

  it('creates all five role test accounts exactly once', () => {
    for (const role of ['founder', 'admin', 'lead', 'ic', 'intern'] as const) {
      const matches = data.users.filter((u) => u.testRole === role);
      expect(matches).toHaveLength(1);
      expect(matches[0].email).toBe(TEST_ACCOUNTS[role].email);
      expect(matches[0].isActive).toBe(true);
    }
    expect(data.users.find((u) => u.testRole === 'founder')!.role).toBe('founder');
  });

  it('keeps the source reporting chain and secondary leads', () => {
    const byKey = new Map(data.users.map((u) => [u.key, u]));
    expect(byKey.get('u4')!.reportsToKey).toBe('u3');
    expect(byKey.get('u3')!.reportsToKey).toBe('u1');
    expect(byKey.get('u5')!.isHidden).toBe(true);
    expect(byKey.get('u6')!.secondaryKeys).toEqual(['u3']);
    expect(byKey.get('u2')!.hasReportingRow).toBe(false); // no row = reports to the founder
    expect(byKey.get('u5')!.isActive).toBe(false);
  });

  it('gives the lead account reports two levels deep', () => {
    const lead = data.users.find((u) => u.testRole === 'lead')!;
    const direct = data.users.filter((u) => u.reportsToKey === lead.key);
    expect(direct.length).toBeGreaterThanOrEqual(2);
    expect(direct.some((u) => u.testRole === 'ic')).toBe(true);
    const second = data.users.filter((u) => direct.some((d) => d.key === u.reportsToKey));
    expect(second.some((u) => u.testRole === 'intern')).toBe(true);
    expect(lead.toolAccess).toContain('attendance');
  });

  it('copies project shape with fake names and drops unknown users', () => {
    expect(data.projects).toHaveLength(2);
    const [p] = data.projects;
    expect(p.name).not.toMatch(/real/i);
    expect(p.description.startsWith('[preview-seed]')).toBe(true);
    expect(p.states.map((s) => s.name)).toEqual(['Todo', 'Done']);
    expect(p.items.map((i) => i.name)).toEqual(['Sample task 1', 'Sample task 2']);
    expect(p.items[1].parentKey).toBe('w1000');
    expect(p.items[1].completedAt).not.toBeNull();
    expect(p.items[1].assigneeKeys).toEqual([]);
    expect(p.members).toEqual([{ userKey: 'u3', role: 'admin' }]);
    expect(new Set(data.projects.map((x) => x.slug)).size).toBe(2);
  });

  it('makes up attendance and timesheets only for active users, in past weeks', () => {
    const activeKeys = new Set(data.users.filter((u) => u.isActive).map((u) => u.key));
    expect(data.attendance.every((a) => activeKeys.has(a.userKey))).toBe(true);
    expect(data.attendance.every((a) => a.weekStart < '2026-10-12')).toBe(true);
    expect(data.timesheets.length).toBeGreaterThan(0);
    for (const t of data.timesheets) {
      expect(new Date(t.clockedOutAt).getTime() - new Date(t.clockedInAt).getTime()).toBe(t.durationSeconds * 1000);
      expect(t.clockedInAt < now.toISOString()).toBe(true);
    }
  });

  it('is deterministic', () => {
    expect(buildFakeDataset(structure, { now })).toEqual(data);
  });

  it('still creates every role account from an empty source', () => {
    const empty = buildFakeDataset({
      users: [], reporting: [], secondary: [], departments: [], projects: [], states: [],
      members: [], workItems: [], assignees: [], positions: [],
    }, { now });
    expect(empty.users.filter((u) => u.testRole).map((u) => u.testRole).sort())
      .toEqual(['admin', 'founder', 'ic', 'intern', 'lead']);
  });
});
