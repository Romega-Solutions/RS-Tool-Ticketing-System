// Reporting-chain graph helpers (pure, no I/O — see reporting-tree-server.ts
// for the Supabase loader).
//
// Model, mirroring User Management and the profile page:
//   - user_reporting.reports_to_user_id is a user's main lead. No row, or a
//     null value, means "reports to the founder" by default.
//   - user_secondary_leads ("also reports to") links count exactly like the
//     main line, so a secondary lead sees that person and everyone below them.
//   - The founder is found by role (raw 'founder', then 'ceo', then 'owner',
//     active users only), never by a hardcoded id. The founder has no manager.
//
// Visibility: a user sees themselves plus everyone below them, at any depth,
// through main or secondary links. No peers, no manager's manager. Hidden
// users (user_reporting.is_hidden) are left out of what a non-admin sees, but
// the walk still passes through them so the people below them stay visible.

export type OrgUser = { id: number; role: string | null; isActive: boolean };
export type ReportingRow = { userId: number; reportsToUserId: number | null; isHidden: boolean };
export type SecondaryLeadRow = { userId: number; alsoReportsToUserId: number };

export type ReportingGraph = {
  founderId: number | null;
  /** userId → effective main lead (founder default applied). null = no lead. */
  supervisorOf: Map<number, number | null>;
  /** leadId → direct reports (main + secondary links). */
  childrenOf: Map<number, Set<number>>;
  hiddenIds: Set<number>;
};

/** Default cap on how many levels down the visibility walk goes. */
export const MAX_REPORTING_DEPTH = 20;

const FOUNDER_ROLE_PRIORITY = ['founder', 'ceo', 'owner'];

export function findFounderId(users: OrgUser[]): number | null {
  for (const role of FOUNDER_ROLE_PRIORITY) {
    const ids = users
      .filter(u => u.isActive && String(u.role ?? '').trim().toLowerCase() === role)
      .map(u => u.id)
      .sort((a, b) => a - b);
    if (ids.length) return ids[0];
  }
  return null;
}

export function buildReportingGraph(
  users: OrgUser[],
  reporting: ReportingRow[],
  secondary: SecondaryLeadRow[],
): ReportingGraph {
  const founderId = findFounderId(users);
  const userIds = new Set(users.map(u => u.id));
  const rowByUser = new Map(reporting.map(r => [r.userId, r] as const));
  const supervisorOf = new Map<number, number | null>();
  const childrenOf = new Map<number, Set<number>>();
  const hiddenIds = new Set(reporting.filter(r => r.isHidden).map(r => r.userId));

  const link = (leadId: number, userId: number) => {
    if (leadId === userId) return;
    let set = childrenOf.get(leadId);
    if (!set) { set = new Set(); childrenOf.set(leadId, set); }
    set.add(userId);
  };

  for (const { id } of users) {
    const explicit = rowByUser.get(id)?.reportsToUserId ?? null;
    // A lead id pointing at a user we don't know about falls back to the
    // founder default, the same as an empty Reports To.
    const lead = explicit != null && userIds.has(explicit)
      ? explicit
      : (id === founderId ? null : founderId);
    supervisorOf.set(id, lead);
    if (lead != null) link(lead, id);
  }
  for (const { userId, alsoReportsToUserId } of secondary) {
    if (userIds.has(userId) && userIds.has(alsoReportsToUserId)) link(alsoReportsToUserId, userId);
  }

  return { founderId, supervisorOf, childrenOf, hiddenIds };
}

/**
 * Everyone below rootId (not including rootId), breadth-first. A visited set
 * makes cycles in bad data harmless; maxDepth bounds the walk.
 */
export function collectSubtree(graph: ReportingGraph, rootId: number, maxDepth = Infinity): Set<number> {
  const seen = new Set<number>([rootId]);
  const below = new Set<number>();
  let frontier = [rootId];
  for (let depth = 0; frontier.length && depth < maxDepth; depth++) {
    const next: number[] = [];
    for (const id of frontier) {
      for (const child of graph.childrenOf.get(id) ?? []) {
        if (seen.has(child)) continue;
        seen.add(child);
        below.add(child);
        next.push(child);
      }
    }
    frontier = next;
  }
  return below;
}

/**
 * The ids a non-admin viewer may see on Attendance: themselves plus everyone
 * below them, minus hidden users (the viewer always sees themselves).
 */
export function computeVisibleUserIds(
  graph: ReportingGraph,
  viewerId: number,
  maxDepth = MAX_REPORTING_DEPTH,
): number[] {
  const ids = [viewerId];
  for (const id of collectSubtree(graph, viewerId, maxDepth)) {
    if (!graph.hiddenIds.has(id)) ids.push(id);
  }
  return ids;
}

/** The lead a user reports to on their main line (founder default applied). */
export function getImmediateSupervisor(graph: ReportingGraph, userId: number): number | null {
  if (graph.supervisorOf.has(userId)) return graph.supervisorOf.get(userId) ?? null;
  return userId === graph.founderId ? null : graph.founderId;
}

/** True when anyone reports to this user, through a main or secondary link. */
export function hasReports(graph: ReportingGraph, userId: number): boolean {
  return (graph.childrenOf.get(userId)?.size ?? 0) > 0;
}

/**
 * Would pointing userId at these leads create a loop? True when any proposed
 * lead is userId or already sits somewhere below userId. A null main lead
 * means the founder default, so it is checked as the founder.
 */
export function findReportingLoop(
  graph: ReportingGraph,
  userId: number,
  reportsToUserId: number | null,
  alsoReportsToUserIds: number[],
): number | null {
  const mainLead = reportsToUserId ?? (userId === graph.founderId ? null : graph.founderId);
  const proposed = [mainLead, ...alsoReportsToUserIds].filter((id): id is number => id != null);
  if (proposed.includes(userId)) return userId;
  const below = collectSubtree(graph, userId);
  return proposed.find(id => below.has(id)) ?? null;
}
