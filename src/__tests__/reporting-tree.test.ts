import { describe, expect, it } from 'vitest';
import {
  buildReportingGraph,
  collectSubtree,
  computeVisibleUserIds,
  findFounderId,
  findReportingLoop,
  getImmediateSupervisor,
  hasReports,
  MAX_REPORTING_DEPTH,
  type OrgUser,
  type ReportingRow,
  type SecondaryLeadRow,
} from '@/lib/reporting-tree';

const u = (id: number, role = 'ic', isActive = true): OrgUser => ({ id, role, isActive });
const r = (userId: number, reportsToUserId: number | null, isHidden = false): ReportingRow => ({ userId, reportsToUserId, isHidden });
const s = (userId: number, alsoReportsToUserId: number): SecondaryLeadRow => ({ userId, alsoReportsToUserId });
const sorted = (ids: Iterable<number>) => [...ids].sort((a, b) => a - b);

// 1 founder
// └─ 2 lead
//    ├─ 3 team member
//    │  └─ 4 intern
//    └─ 5 team member (peer of 3)
// 6 lead (no reporting row → founder by default)
//    └─ 7 team member
const users = [u(1, 'founder'), u(2, 'lead'), u(3), u(4, 'intern'), u(5), u(6, 'lead'), u(7)];
const reporting = [r(2, 1), r(3, 2), r(4, 3), r(5, 2), r(7, 6)];

describe('findFounderId', () => {
  it('finds the founder by role, not id', () => {
    expect(findFounderId([u(9), u(42, 'founder')])).toBe(42);
  });

  it('prefers founder over ceo over owner, and ignores inactive users', () => {
    expect(findFounderId([u(5, 'ceo'), u(8, 'Founder')])).toBe(8);
    expect(findFounderId([u(5, 'ceo', false), u(6, 'owner')])).toBe(6);
    expect(findFounderId([u(5, 'admin'), u(6, 'lead')])).toBeNull();
  });
});

describe('computeVisibleUserIds', () => {
  const graph = buildReportingGraph(users, reporting, []);

  it('a lead sees self, their team member and that member\'s intern', () => {
    expect(sorted(computeVisibleUserIds(graph, 2))).toEqual([2, 3, 4, 5]);
  });

  it('a team member sees only self and the intern below them (no peers, no manager)', () => {
    expect(sorted(computeVisibleUserIds(graph, 3))).toEqual([3, 4]);
  });

  it('an intern with nobody below sees only themselves', () => {
    expect(computeVisibleUserIds(graph, 4)).toEqual([4]);
  });

  it('a user with no reporting row reports to the founder', () => {
    expect(getImmediateSupervisor(graph, 6)).toBe(1);
    expect(sorted(computeVisibleUserIds(graph, 1))).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('a null reports_to also means the founder', () => {
    const g = buildReportingGraph([u(1, 'founder'), u(2)], [r(2, null)], []);
    expect(getImmediateSupervisor(g, 2)).toBe(1);
    expect(computeVisibleUserIds(g, 1)).toEqual([1, 2]);
  });

  it('the founder has no supervisor', () => {
    expect(getImmediateSupervisor(graph, 1)).toBeNull();
  });

  it('walks many levels deep', () => {
    // 10 → 11 → 12 → … → 19, each reporting to the previous one.
    const chainUsers = Array.from({ length: 10 }, (_, i) => u(10 + i));
    const chain = Array.from({ length: 9 }, (_, i) => r(11 + i, 10 + i));
    const g = buildReportingGraph(chainUsers, chain, []);
    expect(sorted(computeVisibleUserIds(g, 10))).toEqual(chainUsers.map(x => x.id));
    expect(sorted(computeVisibleUserIds(g, 15))).toEqual([15, 16, 17, 18, 19]);
  });

  it('stops at the depth cap', () => {
    const n = MAX_REPORTING_DEPTH + 5;
    const chainUsers = Array.from({ length: n }, (_, i) => u(100 + i));
    const chain = Array.from({ length: n - 1 }, (_, i) => r(101 + i, 100 + i));
    const g = buildReportingGraph(chainUsers, chain, []);
    expect(computeVisibleUserIds(g, 100)).toHaveLength(MAX_REPORTING_DEPTH + 1);
    expect(computeVisibleUserIds(g, 100, 2)).toEqual([100, 101, 102]);
  });

  it('counts secondary ("also reports to") links fully, including people below them', () => {
    // 5 also reports to 6, so 6 sees 5; 3 also reports to 7, so 7 sees 3 and 3's intern.
    const g = buildReportingGraph(users, reporting, [s(5, 6), s(3, 7)]);
    expect(sorted(computeVisibleUserIds(g, 6))).toEqual([3, 4, 5, 6, 7]);
    expect(sorted(computeVisibleUserIds(g, 7))).toEqual([3, 4, 7]);
    // The main line is unchanged.
    expect(sorted(computeVisibleUserIds(g, 2))).toEqual([2, 3, 4, 5]);
  });

  it('survives cycles in bad data', () => {
    const g = buildReportingGraph([u(1), u(2), u(3)], [r(1, 3), r(2, 1), r(3, 2)], []);
    expect(sorted(computeVisibleUserIds(g, 1))).toEqual([1, 2, 3]);
    const g2 = buildReportingGraph([u(1), u(2)], [r(2, 1)], [s(1, 2)]);
    expect(sorted(computeVisibleUserIds(g2, 2))).toEqual([1, 2]);
  });

  it('hides hidden users but still shows the people below them', () => {
    const g = buildReportingGraph(users, [...reporting.filter(x => x.userId !== 3), r(3, 2, true)], []);
    expect(sorted(computeVisibleUserIds(g, 2))).toEqual([2, 4, 5]);
  });

  it('a hidden user still sees themselves', () => {
    const g = buildReportingGraph(users, [...reporting.filter(x => x.userId !== 3), r(3, 2, true)], []);
    expect(sorted(computeVisibleUserIds(g, 3))).toEqual([3, 4]);
  });

  it('a lead id pointing at an unknown user falls back to the founder', () => {
    const g = buildReportingGraph([u(1, 'founder'), u(2)], [r(2, 999)], []);
    expect(getImmediateSupervisor(g, 2)).toBe(1);
  });
});

describe('hasReports', () => {
  it('is true only for users someone reports to (main or secondary)', () => {
    const g = buildReportingGraph(users, reporting, [s(4, 5)]);
    expect(hasReports(g, 2)).toBe(true);
    expect(hasReports(g, 3)).toBe(true);
    expect(hasReports(g, 4)).toBe(false);
    expect(hasReports(g, 5)).toBe(true);   // via the secondary link
    expect(hasReports(g, 1)).toBe(true);   // founder default
  });
});

describe('findReportingLoop', () => {
  const graph = buildReportingGraph(users, reporting, [s(7, 3)]);

  it('rejects a lead who already reports up to the user (directly or deeper)', () => {
    expect(findReportingLoop(graph, 2, 3, [])).toBe(3);
    expect(findReportingLoop(graph, 2, 4, [])).toBe(4);
  });

  it('checks "also reports to" leads and secondary links too', () => {
    expect(findReportingLoop(graph, 2, 1, [4])).toBe(4);
    // 7 sits below 3 via a secondary link, so 3 cannot report to 7.
    expect(findReportingLoop(graph, 3, 7, [])).toBe(7);
  });

  it('rejects self', () => {
    expect(findReportingLoop(graph, 3, 3, [])).toBe(3);
  });

  it('treats a null lead as the founder default', () => {
    expect(findReportingLoop(graph, 3, null, [])).toBeNull();
    // The founder pointed at anyone in the tree would loop back to them.
    expect(findReportingLoop(graph, 1, 6, [])).toBe(6);
    expect(findReportingLoop(graph, 1, null, [])).toBeNull();
  });

  it('allows a valid move', () => {
    expect(findReportingLoop(graph, 4, 5, [6])).toBeNull();
    expect(findReportingLoop(graph, 6, 2, [])).toBeNull();
  });

  it('is not limited by the visibility depth cap', () => {
    const n = MAX_REPORTING_DEPTH + 10;
    const chainUsers = Array.from({ length: n }, (_, i) => u(100 + i));
    const chain = Array.from({ length: n - 1 }, (_, i) => r(101 + i, 100 + i));
    const g = buildReportingGraph(chainUsers, chain, []);
    expect(collectSubtree(g, 100).size).toBe(n - 1);
    expect(findReportingLoop(g, 100, 100 + n - 1, [])).toBe(100 + n - 1);
  });
});
