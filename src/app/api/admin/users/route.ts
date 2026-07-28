import { NextResponse } from 'next/server';
import { unstable_cache, revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { hash } from 'bcryptjs';
import { route, requireAdmin } from '@/lib/api';
import { recordAudit, deriveUserPatchAction } from '@/lib/audit';
import { enforceRateLimit, keyByUser } from '@/lib/rate-limit';
import { isGateableToolKey, defaultToolAccess, normalizeRole } from '@/lib/rbac';
import { USERS_LIST_TAG } from '@/lib/cache-tags';
import { removeUserFromAllProjects } from '@/lib/tickets';

export const runtime = 'nodejs';

// Normalize a raw tool_access value (from a DB row) to a clean string[].
function readToolAccess(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter(isGateableToolKey) : [];
}

// Validate + dedup a client-supplied toolAccess array. Returns null if invalid.
function parseToolAccess(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  if (!raw.every(isGateableToolKey)) return null;
  return [...new Set(raw as string[])];
}

// Optional 'YYYY-MM-DD' date. Returns the trimmed value, null to clear, or
// undefined-as-error. Lenient: trusts the HTML date input format.
function parseDate(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null };
  const s = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, error: 'Dates must be YYYY-MM-DD' };
  return { ok: true, value: s };
}

// Optional Google Drive (or any https) link.
function parseDriveUrl(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null };
  const s = String(raw).trim();
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'Drive link must be an http(s) URL' };
  } catch {
    return { ok: false, error: 'Drive link must be a valid URL' };
  }
  return { ok: true, value: s };
}

// All known role strings — any value outside this set is rejected
const VALID_ROLES = new Set([
  'intern', 'ic', 'lead', 'admin', 'founder', 'ceo', 'owner', 'superadmin',
  'team_lead', 'teamlead', 'manager', 'tl',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9_.-]{2,64}$/;

// Parse an hourly rate. Returns:
//   { ok: true, value }  — value is a number rounded to 2dp, or null to clear
//   { ok: false, error } — invalid input
function parseHourlyRate(
  raw: unknown,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null };
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return { ok: false, error: 'Hourly rate must be a number' };
  if (n < 0) return { ok: false, error: 'Hourly rate cannot be negative' };
  if (n >= 100_000_000) return { ok: false, error: 'Hourly rate is too large' };
  return { ok: true, value: Math.round(n * 100) / 100 };
}

// Optional whole-number approved weekly hours — the per-user base for the
// overtime cap/allowance. Defaults to 15 when omitted; bounded 1–60.
function parseApprovedHours(raw: unknown): { ok: true; value: number } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: 15 };
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isInteger(n)) return { ok: false, error: 'Approved hours must be a whole number' };
  if (n < 1 || n > 60) return { ok: false, error: 'Approved hours must be between 1 and 60' };
  return { ok: true, value: n };
}

// Optional 'HH:MM' 24-hour PHT schedule time. '' / null clears it.
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function parseHhmm(raw: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null };
  const s = String(raw).trim();
  if (!HHMM_RE.test(s)) return { ok: false, error: 'Schedule time must be HH:MM (24-hour)' };
  return { ok: true, value: s };
}

// Find a Supabase Auth user by email. supabase-js admin has no direct email
// lookup, so we paginate listUsers. Used to recover orphaned auth accounts
// (in auth.users but with no public.users profile row).
async function findAuthUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<{ id: string } | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data.users.length) return null;
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === target);
    if (hit) return { id: hit.id };
    if (data.users.length < 200) return null;
  }
  return null;
}

const getCachedUserRows = unstable_cache(
  async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('users')
      .select('id, username, name, email, role, team, job_title, member_code, hourly_rate_usd, is_active, tool_access, date_of_birth, start_date, end_date, drive_url, approved_hours_per_week, schedule_pht_start, schedule_pht_end, setup_email_sent_at')
      .order('name');
    if (error) throw new Error(`getCachedUserRows: ${error.message}`);
    return data ?? [];
  },
  ['admin-user-rows'],
  { revalidate: 300, tags: [USERS_LIST_TAG] },
);

export const GET = route(async () => {
  await requireAdmin();

  const allUsers = await getCachedUserRows();

  const mapped = allUsers.map((u: Record<string, unknown>) => ({
    id:            u.id,
    username:      u.username,
    name:          u.name,
    email:         u.email,
    role:          u.role,
    team:          u.team,
    jobTitle:      u.job_title,
    memberCode:    u.member_code,
    hourlyRateUsd: u.hourly_rate_usd == null ? null : Number(u.hourly_rate_usd),
    isActive:      Boolean(u.is_active),
    toolAccess:    readToolAccess(u.tool_access),
    dateOfBirth:   u.date_of_birth ?? null,
    startDate:     u.start_date ?? null,
    endDate:       u.end_date ?? null,
    driveUrl:      u.drive_url ?? null,
    approvedHoursPerWeek: u.approved_hours_per_week == null ? 15 : Number(u.approved_hours_per_week),
    schedulePhtStart: u.schedule_pht_start ?? null,
    schedulePhtEnd:   u.schedule_pht_end ?? null,
    setupEmailSentAt: u.setup_email_sent_at ?? null,
  }));

  return NextResponse.json({ users: mapped });
});

// POST — create a new user in Supabase Auth + public.users
export const POST = route(async (req: Request) => {
  const session = await requireAdmin();
  await enforceRateLimit({ key: keyByUser('admin-users-write', session.id), limit: 30, windowSeconds: 60 });

  let body: {
    email?: string;
    password?: string;
    name?: string;
    username?: string;
    role?: string;
    team?: string;
    jobTitle?: string;
    memberCode?: string;
    hourlyRateUsd?: number | string | null;
    dateOfBirth?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    driveUrl?: string | null;
    approvedHoursPerWeek?: number | string | null;
    schedulePhtStart?: string | null;
    schedulePhtEnd?: string | null;
  } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rate = parseHourlyRate(body.hourlyRateUsd);
  if (!rate.ok) return NextResponse.json({ error: rate.error }, { status: 400 });
  const dob = parseDate(body.dateOfBirth);
  if (!dob.ok) return NextResponse.json({ error: `Date of birth: ${dob.error}` }, { status: 400 });
  const start = parseDate(body.startDate);
  if (!start.ok) return NextResponse.json({ error: `Start date: ${start.error}` }, { status: 400 });
  const end = parseDate(body.endDate);
  if (!end.ok) return NextResponse.json({ error: `End date: ${end.error}` }, { status: 400 });
  const drive = parseDriveUrl(body.driveUrl);
  if (!drive.ok) return NextResponse.json({ error: drive.error }, { status: 400 });
  const approvedHours = parseApprovedHours(body.approvedHoursPerWeek);
  if (!approvedHours.ok) return NextResponse.json({ error: approvedHours.error }, { status: 400 });
  const phtStart = parseHhmm(body.schedulePhtStart);
  if (!phtStart.ok) return NextResponse.json({ error: `Schedule start: ${phtStart.error}` }, { status: 400 });
  const phtEnd = parseHhmm(body.schedulePhtEnd);
  if (!phtEnd.ok) return NextResponse.json({ error: `Schedule end: ${phtEnd.error}` }, { status: 400 });

  const email    = body.email?.trim().toLowerCase() ?? '';
  const password = body.password?.trim() ?? '';
  const name     = body.name?.trim() ?? '';
  const username = body.username?.trim().toLowerCase() ?? '';
  const role     = body.role?.trim() || 'ic';
  const team     = body.team?.trim() || null;
  const memberCode = body.memberCode?.trim() || null;
  const jobTitle = body.jobTitle?.trim() || null;
  // Default Access: pre-fill tool access from role + department (admin tweaks after).
  const autoToolAccess = defaultToolAccess(normalizeRole(role), team);

  if (!email || !password || !name || !username) {
    return NextResponse.json(
      { error: 'email, password, name, and username are all required' },
      { status: 400 },
    );
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }
  if (!USERNAME_RE.test(username)) {
    return NextResponse.json({ error: 'Username must be 2–64 chars: letters, numbers, _ . -' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }
  if (role !== 'ic' && !VALID_ROLES.has(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Create in Supabase Auth — self-healing. If the email already exists in
  //    Auth but has NO public.users profile (an orphaned auth account left by a
  //    half-finished create or a deleted profile), adopt that auth user instead
  //    of failing — otherwise the email is permanently un-registerable.
  let authUserId: string;
  try {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) {
      const alreadyExists = error.message.toLowerCase().includes('already') || error.message.includes('exists');
      if (!alreadyExists) {
        return NextResponse.json({ error: `Supabase Auth error: ${error.message}` }, { status: 500 });
      }
      // A real profile with this email → genuine duplicate.
      const { data: existingProfile } = await admin.from('users').select('id').eq('email', email).maybeSingle();
      if (existingProfile) {
        return NextResponse.json({ error: 'A user with that email already exists' }, { status: 409 });
      }
      // Orphaned auth account → recover it: locate it, reset its password +
      // confirm its email, and reuse its id for the new profile below.
      const orphan = await findAuthUserByEmail(admin, email);
      if (!orphan) {
        return NextResponse.json(
          { error: 'That email is registered in auth but its account could not be located. Please contact an administrator.' },
          { status: 409 },
        );
      }
      const { error: fixErr } = await admin.auth.admin.updateUserById(orphan.id, { password, email_confirm: true });
      if (fixErr) {
        return NextResponse.json({ error: `Could not recover the existing auth account: ${fixErr.message}` }, { status: 500 });
      }
      authUserId = orphan.id;
    } else {
      authUserId = data.user.id;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // 2. Insert into public.users
  try {
    const passwordHash = await hash(password, 10);
    const now = new Date().toISOString();
    const { data: inserted, error: dbErr } = await admin
      .from('users')
      .insert({
        username,
        password_hash: passwordHash,
        name,
        email,
        role,
        team,
        job_title:   jobTitle,
        member_code: memberCode,
        hourly_rate_usd: rate.value,
        date_of_birth: dob.value,
        start_date:    start.value,
        end_date:      end.value,
        drive_url:     drive.value,
        approved_hours_per_week: approvedHours.value,
        schedule_pht_start: phtStart.value,
        schedule_pht_end:   phtEnd.value,
        tool_access:   autoToolAccess,
        is_active:  1,
        created_at: now,
        updated_at: now,
      })
      .select('id, username, name, email, role, team, job_title, member_code, hourly_rate_usd, is_active, tool_access, date_of_birth, start_date, end_date, drive_url, approved_hours_per_week, schedule_pht_start, schedule_pht_end, setup_email_sent_at')
      .single();

    if (dbErr) throw new Error(dbErr.message);

    await recordAudit({
      actorId: session.id,
      action: 'user.created',
      targetUserId: inserted.id as number,
      details: { role, team },
    });

    try {
      revalidateTag(USERS_LIST_TAG, { expire: 0 });
    } catch {
      // Best-effort cache invalidation — must not roll back the user we just created.
    }

    return NextResponse.json({
      user: {
        id:            inserted.id,
        username:      inserted.username,
        name:          inserted.name,
        email:         inserted.email,
        role:          inserted.role,
        team:          inserted.team,
        jobTitle:      inserted.job_title,
        memberCode:    inserted.member_code,
        hourlyRateUsd: inserted.hourly_rate_usd == null ? null : Number(inserted.hourly_rate_usd),
        isActive:      Boolean(inserted.is_active),
        toolAccess:    readToolAccess(inserted.tool_access),
        dateOfBirth:   inserted.date_of_birth ?? null,
        startDate:     inserted.start_date ?? null,
        endDate:       inserted.end_date ?? null,
        driveUrl:      inserted.drive_url ?? null,
        approvedHoursPerWeek: inserted.approved_hours_per_week == null ? 15 : Number(inserted.approved_hours_per_week),
        schedulePhtStart: inserted.schedule_pht_start ?? null,
        schedulePhtEnd:   inserted.schedule_pht_end ?? null,
        setupEmailSentAt: inserted.setup_email_sent_at ?? null,
      },
    }, { status: 201 });
  } catch (err) {
    // Roll back the Supabase Auth user if DB insert fails
    try { await admin.auth.admin.deleteUser(authUserId); } catch { /* best-effort */ }

    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('users_email_unique') || msg.includes('unique')) {
      return NextResponse.json({ error: 'Email or username already in use' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create user in database' }, { status: 500 });
  }
});

export const PATCH = route(async (req: Request) => {
  const session = await requireAdmin();
  await enforceRateLimit({ key: keyByUser('admin-users-write', session.id), limit: 30, windowSeconds: 60 });

  let body: {
    id?: number;
    role?: string;
    isActive?: number;
    team?: string | null;
    memberCode?: string | null;
    hourlyRateUsd?: number | string | null;
    toolAccess?: string[];
    dateOfBirth?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    driveUrl?: string | null;
    approvedHoursPerWeek?: number | string | null;
    schedulePhtStart?: string | null;
    schedulePhtEnd?: string | null;
  } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  // Admins can change their own role here; every other field on their own
  // account still must go through the profile page.
  if (body.id === session.id) {
    const otherFieldsPresent = Object.keys(body).some((k) => k !== 'id' && k !== 'role');
    if (otherFieldsPresent || body.role === undefined) {
      return NextResponse.json({ error: 'You can only change your own role here — use the profile page for other fields' }, { status: 403 });
    }
  }

  if (body.role !== undefined && !VALID_ROLES.has(body.role)) {
    return NextResponse.json({ error: `Invalid role. Allowed: ${[...VALID_ROLES].join(', ')}` }, { status: 400 });
  }
  if (body.isActive !== undefined && body.isActive !== 0 && body.isActive !== 1) {
    return NextResponse.json({ error: 'isActive must be 0 or 1' }, { status: 400 });
  }

  let toolAccessUpdate: string[] | undefined;
  if (body.toolAccess !== undefined) {
    const parsed = parseToolAccess(body.toolAccess);
    if (!parsed) return NextResponse.json({ error: 'toolAccess must be an array of valid tool keys' }, { status: 400 });
    toolAccessUpdate = parsed;
  }

  const updates: Record<string, unknown> = {};
  if (body.role !== undefined)          updates.role           = body.role;
  if (body.isActive !== undefined)      updates.is_active      = body.isActive;
  if (body.team !== undefined)          updates.team           = body.team?.trim() || null;
  if (body.memberCode !== undefined)    updates.member_code    = body.memberCode?.trim() || null;
  if (toolAccessUpdate !== undefined)   updates.tool_access    = toolAccessUpdate;
  if (body.hourlyRateUsd !== undefined) {
    const rate = parseHourlyRate(body.hourlyRateUsd);
    if (!rate.ok) return NextResponse.json({ error: rate.error }, { status: 400 });
    updates.hourly_rate_usd = rate.value;
  }
  if (body.dateOfBirth !== undefined) {
    const d = parseDate(body.dateOfBirth);
    if (!d.ok) return NextResponse.json({ error: `Date of birth: ${d.error}` }, { status: 400 });
    updates.date_of_birth = d.value;
  }
  if (body.startDate !== undefined) {
    const d = parseDate(body.startDate);
    if (!d.ok) return NextResponse.json({ error: `Start date: ${d.error}` }, { status: 400 });
    updates.start_date = d.value;
  }
  if (body.endDate !== undefined) {
    const d = parseDate(body.endDate);
    if (!d.ok) return NextResponse.json({ error: `End date: ${d.error}` }, { status: 400 });
    updates.end_date = d.value;
  }
  if (body.driveUrl !== undefined) {
    const u = parseDriveUrl(body.driveUrl);
    if (!u.ok) return NextResponse.json({ error: u.error }, { status: 400 });
    updates.drive_url = u.value;
  }
  if (body.approvedHoursPerWeek !== undefined) {
    const a = parseApprovedHours(body.approvedHoursPerWeek);
    if (!a.ok) return NextResponse.json({ error: a.error }, { status: 400 });
    updates.approved_hours_per_week = a.value;
  }
  if (body.schedulePhtStart !== undefined) {
    const t = parseHhmm(body.schedulePhtStart);
    if (!t.ok) return NextResponse.json({ error: `Schedule start: ${t.error}` }, { status: 400 });
    updates.schedule_pht_start = t.value;
  }
  if (body.schedulePhtEnd !== undefined) {
    const t = parseHhmm(body.schedulePhtEnd);
    if (!t.ok) return NextResponse.json({ error: `Schedule end: ${t.error}` }, { status: 400 });
    updates.schedule_pht_end = t.value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  const admin = createAdminClient();
  const { data: before } = await admin
    .from('users')
    .select('role, is_active, tool_access')
    .eq('id', body.id)
    .maybeSingle();

  const { error: updateError } = await admin.from('users').update(updates).eq('id', body.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const { data: updated } = await admin
    .from('users')
    .select('id, username, name, email, role, team, job_title, member_code, hourly_rate_usd, is_active, tool_access, date_of_birth, start_date, end_date, drive_url, approved_hours_per_week, schedule_pht_start, schedule_pht_end, setup_email_sent_at')
    .eq('id', body.id)
    .maybeSingle();

  if (!updated) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // Deactivating a user ("Remove" in the Users tab) also strips their active
  // project associations everywhere — every project_members row and every
  // work_item_assignees row for them. History (comments, activity log, work
  // items they created) is untouched; reactivating later does NOT restore
  // these — re-adding a returning user to a project is a deliberate action.
  let projectCleanup: { memberships: number; assignments: number } | null = null;
  if (before && Number(before.is_active) === 1 && Number(updated.is_active) === 0) {
    projectCleanup = await removeUserFromAllProjects(body.id);
  }

  if (before) {
    // Audit a tool-access change on its own (with the added/removed diff).
    const beforeTools = readToolAccess(before.tool_access);
    const afterTools = readToolAccess(updated.tool_access);
    const added = afterTools.filter((t) => !beforeTools.includes(t));
    const removed = beforeTools.filter((t) => !afterTools.includes(t));
    if (added.length || removed.length) {
      await recordAudit({ actorId: session.id, action: 'user.tool_access_changed', targetUserId: body.id, details: { added, removed } });
    }
    // Audit role/active/other-field edits as before (skip the vague 'user.updated'
    // when the only change was tool access).
    const roleChanged = String(before.role) !== String(updated.role);
    const activeChanged = Number(before.is_active) !== Number(updated.is_active);
    const otherFieldChanged = body.team !== undefined || body.memberCode !== undefined || body.hourlyRateUsd !== undefined
      || body.dateOfBirth !== undefined || body.startDate !== undefined || body.endDate !== undefined || body.driveUrl !== undefined
      || body.approvedHoursPerWeek !== undefined || body.schedulePhtStart !== undefined || body.schedulePhtEnd !== undefined;
    if (roleChanged || activeChanged || otherFieldChanged) {
      const { action, details } = deriveUserPatchAction(
        { role: String(before.role), is_active: Number(before.is_active) },
        { role: String(updated.role), is_active: Number(updated.is_active) },
      );
      if (action === 'user.deactivated' && projectCleanup) {
        details.removedProjectMemberships = projectCleanup.memberships;
        details.removedTaskAssignments = projectCleanup.assignments;
      }
      await recordAudit({ actorId: session.id, action, targetUserId: body.id, details });
    }
  }

  revalidateTag(USERS_LIST_TAG, { expire: 0 });

  return NextResponse.json({
    user: {
      id:            updated.id,
      username:      updated.username,
      name:          updated.name,
      email:         updated.email,
      role:          updated.role,
      team:          updated.team,
      jobTitle:      updated.job_title,
      memberCode:    updated.member_code,
      hourlyRateUsd: updated.hourly_rate_usd == null ? null : Number(updated.hourly_rate_usd),
      isActive:      Boolean(updated.is_active),
      toolAccess:    readToolAccess(updated.tool_access),
      dateOfBirth:   updated.date_of_birth ?? null,
      startDate:     updated.start_date ?? null,
      endDate:       updated.end_date ?? null,
      driveUrl:      updated.drive_url ?? null,
      approvedHoursPerWeek: updated.approved_hours_per_week == null ? 15 : Number(updated.approved_hours_per_week),
      schedulePhtStart: updated.schedule_pht_start ?? null,
      schedulePhtEnd:   updated.schedule_pht_end ?? null,
      setupEmailSentAt: updated.setup_email_sent_at ?? null,
    },
  });
});
