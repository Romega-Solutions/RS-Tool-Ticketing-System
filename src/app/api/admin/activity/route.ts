import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { route, requireAdmin } from '@/lib/api';
import { normalizeRole, type AppRole } from '@/lib/rbac';

export const runtime = 'nodejs';

// Aggregated, read-only activity feed for the admin Users → Activity tab.
// There's no dedicated audit-log table, so this merges the most meaningful
// existing timestamped, user-attributable events into one feed. Each item is
// tagged with the actor's (normalized) role + team so the client can filter.

type ActivityType = 'ticket' | 'report' | 'clock' | 'attendance' | 'ping';

interface Activity {
  id: string;
  userId: number;
  userName: string;
  role: AppRole;
  team: string | null;
  type: ActivityType;
  description: string;
  at: string; // ISO timestamp
}

const PER_SOURCE = 60;
const TOTAL = 150;

function describeTicket(action: string): string {
  switch (action) {
    case 'created':       return 'Created a work item';
    case 'edited':        return 'Edited a work item';
    case 'state_changed': return 'Moved a work item to a new state';
    case 'assigned':      return 'Assigned a work item';
    case 'unassigned':    return 'Unassigned a work item';
    case 'commented':     return 'Commented on a work item';
    case 'archived':      return 'Archived a work item';
    default:              return `Work item ${action}`;
  }
}

export const GET = route(async () => {
  await requireAdmin();
  const sb = createAdminClient();

  // Enrichment map + filter options.
  const { data: usersData } = await sb.from('users').select('id, name, role, team');
  const userMap = new Map<number, { name: string; role: AppRole; team: string | null }>();
  for (const u of (usersData ?? []) as { id: number; name: string; role: string; team: string | null }[]) {
    userMap.set(u.id, { name: u.name, role: normalizeRole(u.role), team: u.team ?? null });
  }

  const activities: Activity[] = [];
  const add = (userId: number | null | undefined, id: string, type: ActivityType, description: string, at: string | null) => {
    if (userId == null || !at) return;
    const u = userMap.get(userId);
    if (!u) return; // actor no longer exists — skip
    activities.push({ id, userId, userName: u.name, role: u.role, team: u.team, type, description, at });
  };

  // 1. Work item activity
  const { data: wia } = await sb.from('work_item_activity')
    .select('id, actor_id, action, created_at')
    .order('created_at', { ascending: false }).limit(PER_SOURCE);
  for (const a of (wia ?? []) as { id: number; actor_id: number; action: string; created_at: string | null }[]) {
    add(a.actor_id, `wia-${a.id}`, 'ticket', describeTicket(a.action), a.created_at);
  }

  // 2. Weekly reports submitted
  const { data: wr } = await sb.from('weekly_reports')
    .select('id, user_id, submitted_at').not('submitted_at', 'is', null)
    .order('submitted_at', { ascending: false }).limit(PER_SOURCE);
  for (const r of (wr ?? []) as { id: number; user_id: number; submitted_at: string | null }[]) {
    add(r.user_id, `wr-${r.id}`, 'report', 'Submitted a weekly report', r.submitted_at);
  }

  // 3. Clock in / clock out
  const { data: ts } = await sb.from('timesheets')
    .select('id, user_id, clocked_in_at, clocked_out_at')
    .order('clocked_in_at', { ascending: false }).limit(PER_SOURCE);
  for (const t of (ts ?? []) as { id: number; user_id: number; clocked_in_at: string | null; clocked_out_at: string | null }[]) {
    add(t.user_id, `ts-in-${t.id}`, 'clock', 'Clocked in', t.clocked_in_at);
    if (t.clocked_out_at) add(t.user_id, `ts-out-${t.id}`, 'clock', 'Clocked out', t.clocked_out_at);
  }

  // 4. Admin attendance edits
  const { data: att } = await sb.from('attendance')
    .select('id, edited_by, edited_at, week_start').not('edited_at', 'is', null)
    .order('edited_at', { ascending: false }).limit(PER_SOURCE);
  for (const a of (att ?? []) as { id: number; edited_by: number | null; edited_at: string | null; week_start: string }[]) {
    add(a.edited_by, `att-${a.id}`, 'attendance', `Edited attendance (week of ${a.week_start})`, a.edited_at);
  }

  // 5. Live presence pings sent
  const { data: pp } = await sb.from('presence_pings')
    .select('id, from_user_id, created_at')
    .order('created_at', { ascending: false }).limit(PER_SOURCE);
  for (const p of (pp ?? []) as { id: string; from_user_id: number; created_at: string | null }[]) {
    add(p.from_user_id, `pp-${p.id}`, 'ping', 'Sent a live ping', p.created_at);
  }

  activities.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  const roles = [...new Set([...userMap.values()].map(u => u.role))];
  const teams = [...new Set([...userMap.values()].map(u => u.team).filter((t): t is string => !!t))].sort();

  return NextResponse.json({ activities: activities.slice(0, TOTAL), roles, teams });
});
