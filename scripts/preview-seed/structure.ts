// Reads the anonymized structure of the source database. READ-ONLY: this
// module only ever calls .select(). It never selects names, emails, phone
// numbers, birthdays, rates, bank details, photos, notes or task text.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Structure } from './dataset';

const PAGE = 1000;

async function selectAll<T>(client: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .order(columns.split(',')[0].trim(), { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`read ${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v);
const numOrNull = (v: unknown) => (v == null ? null : Number(v));
const bool = (v: unknown) => v === true || v === 1 || v === '1' || v === 't' || v === 'true';

export async function readStructure(source: SupabaseClient): Promise<Structure> {
  const [users, reporting, secondary, departments, projects, states, members, workItems, assignees, positions] =
    await Promise.all([
      selectAll<Row>(source, 'users', 'id, role, team, is_active, is_onboarding, tool_access, approved_hours_per_week'),
      selectAll<Row>(source, 'user_reporting', 'user_id, reports_to_user_id, display_order, is_hidden'),
      selectAll<Row>(source, 'user_secondary_leads', 'user_id, also_reports_to_user_id'),
      selectAll<Row>(source, 'departments', 'id, name, color, display_order'),
      selectAll<Row>(source, 'projects', 'id, team, archived, network'),
      selectAll<Row>(source, 'project_states', 'id, project_id, name, color, group, sequence, is_default'),
      selectAll<Row>(source, 'project_members', 'id, project_id, user_id, role'),
      selectAll<Row>(source, 'work_items', 'id, project_id, state_id, parent_id, archived, priority, created_by'),
      selectAll<Row>(source, 'work_item_assignees', 'id, work_item_id, user_id'),
      selectAll<Row>(source, 'positions', 'id, is_open, employment_type, placement_type, openings'),
    ]);

  return {
    users: users.map((u) => ({
      id: num(u.id),
      role: String(u.role ?? 'ic'),
      team: (u.team as string | null) ?? null,
      isActive: bool(u.is_active),
      isOnboarding: bool(u.is_onboarding),
      toolAccess: Array.isArray(u.tool_access) ? (u.tool_access as unknown[]).map(String) : [],
      approvedHours: numOrNull(u.approved_hours_per_week),
    })),
    reporting: reporting.map((r) => ({
      userId: num(r.user_id),
      reportsTo: numOrNull(r.reports_to_user_id),
      displayOrder: num(r.display_order ?? 0),
      isHidden: bool(r.is_hidden),
    })),
    secondary: secondary.map((s) => ({ userId: num(s.user_id), alsoReportsTo: num(s.also_reports_to_user_id) })),
    departments: departments.map((d) => ({
      name: String(d.name), color: (d.color as string | null) ?? null, displayOrder: num(d.display_order ?? 0),
    })),
    projects: projects.map((p) => ({
      id: num(p.id), team: (p.team as string | null) ?? null, archived: bool(p.archived), network: num(p.network ?? 2),
    })),
    states: states.map((s) => ({
      id: num(s.id), projectId: num(s.project_id), name: String(s.name), color: String(s.color),
      group: String(s.group), sequence: num(s.sequence), isDefault: bool(s.is_default),
    })),
    members: members.map((m) => ({ projectId: num(m.project_id), userId: num(m.user_id), role: String(m.role) })),
    workItems: workItems.map((w) => ({
      id: num(w.id), projectId: num(w.project_id), stateId: numOrNull(w.state_id), parentId: numOrNull(w.parent_id),
      archived: bool(w.archived), priority: String(w.priority ?? 'none'), createdBy: numOrNull(w.created_by),
    })),
    assignees: assignees.map((a) => ({ workItemId: num(a.work_item_id), userId: num(a.user_id) })),
    positions: positions.map((p) => ({
      isOpen: bool(p.is_open), employmentType: String(p.employment_type), placementType: String(p.placement_type),
      openings: num(p.openings ?? 1),
    })),
  };
}
