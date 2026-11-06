// Writes a FakeDataset to the TARGET database. Callers must have passed
// checkTarget() first. Re-runnable: it first removes only rows the seed owns
// (users on @preview.invalid, projects/positions carrying the seed marker,
// and rows hanging off those), then inserts everything fresh.

import type { SupabaseClient } from '@supabase/supabase-js';
import { allocateProjectSlug } from '../../src/lib/project-slug';
import { allocatePositionSlug } from '../../src/lib/recruiting/position-slug';
import type { FakeDataset } from './dataset';
import { isSeedEmail, SEED_MARKER } from './guards';

type Log = (msg: string) => void;
const CHUNK = 200;

function chunks<T>(rows: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

async function must<T>(label: string, p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

type Row = Record<string, unknown>;

async function insertAll(db: SupabaseClient, table: string, rows: Row[], select?: string): Promise<Row[]> {
  const out: Row[] = [];
  for (const part of chunks(rows)) {
    const q = db.from(table).insert(part);
    const data: unknown = select ? await must(`insert ${table}`, q.select(select)) : await must(`insert ${table}`, q);
    if (Array.isArray(data)) out.push(...(data as Row[]));
  }
  return out;
}

/** Fails if the target isn't ready or holds people the seed didn't create. */
export async function preflight(db: SupabaseClient, opts: { allowOtherUsers: boolean }): Promise<void> {
  const slugCheck = await db.from('projects').select('slug').limit(1);
  if (slugCheck.error) {
    throw new Error(`Target is missing projects.slug (${slugCheck.error.message}). Apply drizzle/0015 and 0016 first.`);
  }
  const deptCheck = await db.from('user_reporting').select('user_id').limit(1);
  if (deptCheck.error) {
    throw new Error(`Target is missing the reporting tables (${deptCheck.error.message}). Apply drizzle/0013 first.`);
  }
  const users = await must('read target users', db.from('users').select('email'));
  const others = (users ?? []).filter((u: { email: string }) => !isSeedEmail(u.email));
  if (others.length > 0 && !opts.allowOtherUsers) {
    throw new Error(
      `Target has ${others.length} user(s) that are not @preview.invalid. Refusing to seed a database with real people. `
      + 'Pass --allow-other-users only if you are sure.',
    );
  }
}

export async function wipeSeeded(db: SupabaseClient, log: Log): Promise<void> {
  const users = await must('read users', db.from('users').select('id, email'));
  const userIds = (users ?? []).filter((u: { email: string }) => isSeedEmail(u.email)).map((u: { id: number }) => u.id);
  const projects = await must('read projects', db.from('projects').select('id').like('description', `${SEED_MARKER}%`));
  const projectIds = (projects ?? []).map((p: { id: number }) => p.id);

  for (const part of chunks(projectIds)) {
    await must('delete seeded projects', db.from('projects').delete().in('id', part)); // cascades states/tasks/members
  }
  await must('delete seeded positions', db.from('positions').delete().like('job_description', `${SEED_MARKER}%`));

  // Tables that reference users without ON DELETE CASCADE.
  const userColumns: [string, string][] = [
    ['timesheet_edit_requests', 'user_id'],
    ['timesheets', 'user_id'],
    ['attendance', 'user_id'],
    ['weekly_reports', 'user_id'],
    ['audit_log', 'actor_id'],
    ['audit_log', 'target_user_id'],
    ['onboarding_settings', 'onboarding_lead_user_id'],
  ];
  for (const part of chunks(userIds)) {
    for (const [table, column] of userColumns) {
      await must(`delete ${table}`, db.from(table).delete().in(column, part));
    }
    await must('delete seeded users', db.from('users').delete().in('id', part));
  }

  // Auth accounts on @preview.invalid only.
  let removedAuth = 0;
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`list auth users: ${error.message}`);
    const seeded = data.users.filter((u) => isSeedEmail(u.email));
    for (const u of seeded) {
      const { error: delErr } = await db.auth.admin.deleteUser(u.id);
      if (delErr) throw new Error(`delete auth user ${u.email}: ${delErr.message}`);
      removedAuth++;
    }
    if (data.users.length < 1000) break;
  }
  log(`removed ${userIds.length} seeded users, ${projectIds.length} seeded projects, ${removedAuth} seeded auth accounts`);
}

export async function writeDataset(db: SupabaseClient, data: FakeDataset, log: Log): Promise<void> {
  const now = new Date().toISOString();

  // Departments: upsert by name (0013 already seeds the defaults).
  if (data.departments.length) {
    await must('upsert departments', db.from('departments').upsert(
      data.departments.map((d) => ({ name: d.name, color: d.color, display_order: d.displayOrder })),
      { onConflict: 'name' },
    ));
  }

  // People.
  const insertedUsers = await insertAll(db, 'users', data.users.map((u) => ({
    username: u.username,
    password_hash: '',
    name: u.name,
    email: u.email,
    role: u.role,
    team: u.team,
    job_title: u.jobTitle,
    member_code: null,
    hourly_rate_usd: u.hourlyRateUsd,
    date_of_birth: null,
    start_date: null,
    end_date: null,
    drive_url: null,
    teams_email: null,
    approved_hours_per_week: u.approvedHours,
    tool_access: u.toolAccess,
    notification_prefs: {},
    reminder_enabled: 0,
    reminder_interval_minutes: 120,
    is_active: u.isActive ? 1 : 0,
    is_onboarding: u.isOnboarding ? 1 : 0,
    created_at: now,
    updated_at: now,
  })), 'id, email');
  const idByEmail = new Map(insertedUsers.map((r) => [String(r.email), Number(r.id)]));
  const userId = new Map(data.users.map((u) => [u.key, idByEmail.get(u.email)!]));
  log(`inserted ${insertedUsers.length} fake users`);

  await insertAll(db, 'user_reporting', data.users.filter((u) => u.hasReportingRow).map((u) => ({
    user_id: userId.get(u.key),
    reports_to_user_id: u.reportsToKey ? userId.get(u.reportsToKey) ?? null : null,
    photo_path: null,
    display_order: u.displayOrder,
    is_hidden: u.isHidden,
    updated_at: now,
  })));
  await insertAll(db, 'user_secondary_leads', data.users.flatMap((u) => u.secondaryKeys
    .filter((k) => userId.has(k) && k !== u.key)
    .map((k) => ({ user_id: userId.get(u.key), also_reports_to_user_id: userId.get(k) }))));

  // Auth accounts for the five role test users only. No password: the
  // preview switcher signs in with a server-generated one-time link.
  for (const u of data.users.filter((x) => x.testRole)) {
    const { error } = await db.auth.admin.createUser({ email: u.email, email_confirm: true });
    if (error) throw new Error(`create auth user ${u.email}: ${error.message}`);
  }
  log(`created ${data.users.filter((x) => x.testRole).length} role test auth accounts`);

  // Projects (avoid slug clashes with anything already on the target).
  const existing = await must('read slugs', db.from('projects').select('slug'));
  const taken = new Set((existing ?? []).map((p: { slug: string | null }) => p.slug).filter(Boolean) as string[]);
  let items = 0;
  for (const p of data.projects) {
    const slug = taken.has(p.slug) ? allocateProjectSlug(p.slug, taken) : p.slug;
    taken.add(slug);
    const [project] = await insertAll(db, 'projects', [{
      name: p.name, identifier: p.identifier, slug, team: p.team, description: p.description,
      archived: p.archived ? 1 : 0, archived_at: p.archived ? now : null, network: p.network,
      next_sequence: p.items.length + 1, created_at: now, updated_at: now,
    }], 'id');
    const projectId = Number(project.id);

    const states = await insertAll(db, 'project_states', p.states.map((s) => ({
      project_id: projectId, name: s.name, color: s.color, group: s.group, sequence: s.sequence, is_default: s.isDefault,
    })), 'id, sequence, name');
    const stateId = new Map<string, number>();
    p.states.forEach((s) => {
      const row = states.find((r) => Number(r.sequence) === s.sequence && String(r.name) === s.name);
      if (row) stateId.set(s.key, Number(row.id));
    });

    await insertAll(db, 'project_members', p.members.map((m) => ({
      project_id: projectId, user_id: userId.get(m.userKey), role: m.role, created_at: now,
    })));

    // Parents first, then sub-issues.
    const itemId = new Map<string, number>();
    const ordered = [...p.items.filter((i) => !i.parentKey), ...p.items.filter((i) => i.parentKey)];
    for (const part of chunks(ordered)) {
      const rows = await insertAll(db, 'work_items', part.map((i) => ({
        project_id: projectId,
        sequence_id: i.sequenceId,
        name: i.name,
        description: null,
        state_id: i.stateKey ? stateId.get(i.stateKey) ?? null : null,
        parent_id: i.parentKey ? itemId.get(i.parentKey) ?? null : null,
        priority: i.priority,
        archived: i.archived ? 1 : 0,
        archived_at: i.archived ? now : null,
        created_by: i.createdByKey ? userId.get(i.createdByKey) ?? null : null,
        completed_at: i.completedAt,
        created_at: i.createdAt,
        updated_at: i.createdAt,
      })), 'id, sequence_id');
      for (const r of rows) {
        const src = part.find((i) => i.sequenceId === Number(r.sequence_id));
        if (src) itemId.set(src.key, Number(r.id));
      }
    }
    await insertAll(db, 'work_item_assignees', p.items.flatMap((i) => [...new Set(i.assigneeKeys)].map((k) => ({
      work_item_id: itemId.get(i.key), user_id: userId.get(k),
    }))).filter((r) => r.work_item_id && r.user_id));
    items += p.items.length;
  }
  log(`inserted ${data.projects.length} fake projects with ${items} fake tasks`);

  // Positions.
  const posExisting = await must('read position slugs', db.from('positions').select('slug'));
  const posTaken = new Set((posExisting ?? []).map((p: { slug: string | null }) => p.slug).filter(Boolean) as string[]);
  await insertAll(db, 'positions', data.positions.map((p) => {
    const slug = posTaken.has(p.slug) ? allocatePositionSlug(p.slug, posTaken) : p.slug;
    posTaken.add(slug);
    return {
      job_title: p.jobTitle, slug, client: p.client, compensation: null, location: 'Remote',
      employment_type: p.employmentType, placement_type: p.placementType, openings: p.openings,
      is_open: p.isOpen, job_description: p.jobDescription, created_by: null,
    };
  }));
  log(`inserted ${data.positions.length} fake positions`);

  // Attendance + timesheets.
  await insertAll(db, 'attendance', data.attendance.map((a) => ({
    user_id: userId.get(a.userKey), week_start: a.weekStart, ...a.statuses, notes: null, submitted_at: now,
  })));
  await insertAll(db, 'timesheets', data.timesheets.map((t) => ({
    user_id: userId.get(t.userKey), date: t.date, clocked_in_at: t.clockedInAt, clocked_out_at: t.clockedOutAt,
    duration_seconds: t.durationSeconds, is_overtime: t.isOvertime ? 1 : 0, overtime_seconds: t.overtimeSeconds,
  })));
  log(`inserted ${data.attendance.length} attendance weeks and ${data.timesheets.length} timesheet sessions`);
}
