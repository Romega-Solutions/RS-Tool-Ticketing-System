import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { route, requireAdmin, badRequest } from '@/lib/api';
import { normalizeRole, type AppRole } from '@/lib/rbac';
import { parseActivityUserId, auditUserFilter, type ActivityChange } from '@/lib/activity';
import { describeAudit, presentAuditChanges } from '@/lib/audit';
import {
  collectActivityRefs, describeWorkItemActivity, type ActivityWorkItem, type WorkItemActivityRow,
} from '@/lib/activity-describe';

export const runtime = 'nodejs';

// Aggregated, read-only activity feed for the admin Users → Activity tab.
// There's no dedicated audit-log table, so this merges the most meaningful
// existing timestamped, user-attributable events into one feed. Each item is
// tagged with the actor's (normalized) role + team so the client can filter.

type ActivityType = 'ticket' | 'report' | 'clock' | 'attendance' | 'ping' | 'admin';

interface Activity {
  id: string;
  userId: number;
  userName: string;
  role: AppRole;
  team: string | null;
  type: ActivityType;
  description: string;
  at: string; // ISO timestamp
  // Admin (audit) entries only: who the action was done to, and the
  // field-by-field changes. Private values are already stripped here.
  targetUserId?: number | null;
  targetUserName?: string | null;
  changes?: ActivityChange[];
  // Work item entries only: plain-text names (never links).
  workItem?: string | null;
  project?: string | null;
}

const PER_SOURCE = 60;
const TOTAL = 150;

type Nested = Record<string, unknown>;

// PostgREST returns a to-one embed as an object (or a one-element array).
function firstNested(v: unknown): Nested | null {
  if (Array.isArray(v)) return (v[0] as Nested | undefined) ?? null;
  return v && typeof v === 'object' ? (v as Nested) : null;
}

function toActivityWorkItem(raw: unknown): ActivityWorkItem | null {
  const w = firstNested(raw);
  if (!w) return null;
  const p = firstNested(w.projects);
  return {
    id: Number(w.id),
    sequenceId: w.sequence_id == null ? null : Number(w.sequence_id),
    name: String(w.name ?? ''),
    projectName: p?.name == null ? null : String(p.name),
    projectIdentifier: p?.identifier == null ? null : String(p.identifier),
  };
}

// id → name for a small set of ids, in one query; empty set = no query.
async function namesById(
  sb: ReturnType<typeof createAdminClient>, table: string, ids: number[],
): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await sb.from(table).select('id, name').in('id', ids);
  return new Map(((data ?? []) as { id: number; name: string }[]).map(r => [Number(r.id), String(r.name)]));
}

export const GET = route(async (req: Request) => {
  await requireAdmin();

  const parsed = parseActivityUserId(new URL(req.url).searchParams.get('userId'));
  if (!parsed.ok) throw badRequest('Invalid userId');
  const userId = parsed.userId; // null = global feed
  const perSource = userId == null ? PER_SOURCE : 200;
  const total = userId == null ? TOTAL : 300;

  const sb = createAdminClient();

  // Enrichment map + filter options.
  const { data: usersData } = await sb.from('users').select('id, name, role, team');
  const userMap = new Map<number, { name: string; role: AppRole; team: string | null }>();
  for (const u of (usersData ?? []) as { id: number; name: string; role: string; team: string | null }[]) {
    userMap.set(u.id, { name: u.name, role: normalizeRole(u.role), team: u.team ?? null });
  }

  const activities: Activity[] = [];
  const add = (
    userId: number | null | undefined, id: string, type: ActivityType, description: string, at: string | null,
    extra?: Pick<Activity, 'targetUserId' | 'targetUserName' | 'changes' | 'workItem' | 'project'>,
  ) => {
    if (userId == null || !at) return;
    const u = userMap.get(userId);
    if (!u) return; // actor no longer exists — skip
    activities.push({ id, userId, userName: u.name, role: u.role, team: u.team, type, description, at, ...extra });
  };
  const nameOf = (id: number) => userMap.get(id)?.name ?? null;

  // 1. Work item activity, named specifically: the item and its project come
  // embedded in the same query; state, cycle and parent names are resolved
  // with one query per kind for the whole page (no per-row lookups).
  let wiaQ = sb.from('work_item_activity')
    .select('id, actor_id, action, work_item_id, from_value, to_value, created_at, work_items(id, sequence_id, name, projects(name, identifier))')
    .order('created_at', { ascending: false }).limit(perSource);
  if (userId != null) wiaQ = wiaQ.eq('actor_id', userId);
  const { data: wia } = await wiaQ;
  type WiaRow = WorkItemActivityRow & { id: number; actor_id: number; created_at: string | null; work_items: unknown };
  const wiaRows = (wia ?? []) as WiaRow[];
  const refs = collectActivityRefs(wiaRows);
  const [stateNames, cycleNames, parentNames] = await Promise.all([
    namesById(sb, 'project_states', refs.stateIds),
    namesById(sb, 'cycles', refs.cycleIds),
    namesById(sb, 'work_items', refs.itemIds),
  ]);
  for (const a of wiaRows) {
    const d = describeWorkItemActivity(a, {
      item:      toActivityWorkItem(a.work_items),
      stateName: id => stateNames.get(id) ?? null,
      userName:  nameOf,
      cycleName: id => cycleNames.get(id) ?? null,
      itemName:  id => parentNames.get(id) ?? null,
    });
    add(a.actor_id, `wia-${a.id}`, 'ticket', d.description, a.created_at, {
      workItem: d.workItem, project: d.project, changes: d.changes,
    });
  }

  // 2. Weekly reports submitted
  let wrQ = sb.from('weekly_reports')
    .select('id, user_id, submitted_at').not('submitted_at', 'is', null)
    .order('submitted_at', { ascending: false }).limit(perSource);
  if (userId != null) wrQ = wrQ.eq('user_id', userId);
  const { data: wr } = await wrQ;
  for (const r of (wr ?? []) as { id: number; user_id: number; submitted_at: string | null }[]) {
    add(r.user_id, `wr-${r.id}`, 'report', 'Submitted a weekly report', r.submitted_at);
  }

  // 3. Clock in / clock out
  let tsQ = sb.from('timesheets')
    .select('id, user_id, clocked_in_at, clocked_out_at')
    .order('clocked_in_at', { ascending: false }).limit(perSource);
  if (userId != null) tsQ = tsQ.eq('user_id', userId);
  const { data: ts } = await tsQ;
  for (const t of (ts ?? []) as { id: number; user_id: number; clocked_in_at: string | null; clocked_out_at: string | null }[]) {
    add(t.user_id, `ts-in-${t.id}`, 'clock', 'Clocked in', t.clocked_in_at);
    if (t.clocked_out_at) add(t.user_id, `ts-out-${t.id}`, 'clock', 'Clocked out', t.clocked_out_at);
  }

  // 4. Admin attendance edits
  let attQ = sb.from('attendance')
    .select('id, edited_by, edited_at, week_start').not('edited_at', 'is', null)
    .order('edited_at', { ascending: false }).limit(perSource);
  if (userId != null) attQ = attQ.eq('edited_by', userId);
  const { data: att } = await attQ;
  for (const a of (att ?? []) as { id: number; edited_by: number | null; edited_at: string | null; week_start: string }[]) {
    add(a.edited_by, `att-${a.id}`, 'attendance', `Edited attendance (week of ${a.week_start})`, a.edited_at);
  }

  // 5. Live presence pings sent
  let ppQ = sb.from('presence_pings')
    .select('id, from_user_id, created_at')
    .order('created_at', { ascending: false }).limit(perSource);
  if (userId != null) ppQ = ppQ.eq('from_user_id', userId);
  const { data: pp } = await ppQ;
  for (const p of (pp ?? []) as { id: string; from_user_id: number; created_at: string | null }[]) {
    add(p.from_user_id, `pp-${p.id}`, 'ping', 'Sent a live ping', p.created_at);
  }

  // 6. Admin actions (audit log). For one person this covers what they did
  // AND what was done to them. Raw details never leave the server: they are
  // turned into display-ready changes with private values removed.
  let auQ = sb.from('audit_log')
    .select('id, actor_id, action, target_user_id, details, created_at')
    .order('created_at', { ascending: false }).limit(perSource);
  if (userId != null) auQ = auQ.or(auditUserFilter(userId));
  const { data: au } = await auQ;
  for (const a of (au ?? []) as { id: number; actor_id: number; action: string; target_user_id: number | null; details: Record<string, unknown> | null; created_at: string | null }[]) {
    add(a.actor_id, `audit-${a.id}`, 'admin', describeAudit(a.action, a.details), a.created_at, {
      targetUserId:   a.target_user_id ?? null,
      targetUserName: a.target_user_id == null ? null : nameOf(a.target_user_id),
      changes:        presentAuditChanges(a.action, a.details, nameOf),
    });
  }

  activities.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  const roles = [...new Set([...userMap.values()].map(u => u.role))];
  const teams = [...new Set([...userMap.values()].map(u => u.team).filter((t): t is string => !!t))].sort();

  return NextResponse.json({ activities: activities.slice(0, total), roles, teams });
});
