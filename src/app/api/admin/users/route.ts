import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { canAccessAdmin } from '@/lib/rbac';
import { createAdminClient } from '@/lib/supabase/admin';
import { hash } from 'bcryptjs';

export const runtime = 'nodejs';

// All known role strings — any value outside this set is rejected
const VALID_ROLES = new Set([
  'ic', 'lead', 'admin', 'ceo', 'owner', 'superadmin',
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

async function requireAdmin() {
  const session = await getSession();
  if (!session || !canAccessAdmin(session.role)) return null;
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin
    .from('users')
    .select('id, username, name, email, role, team, job_title, member_code, hourly_rate_usd, is_active')
    .order('name');
  const allUsers = data ?? [];

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
  }));

  return NextResponse.json({ users: mapped });
}

// POST — create a new user in Supabase Auth + public.users
export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
  } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rate = parseHourlyRate(body.hourlyRateUsd);
  if (!rate.ok) return NextResponse.json({ error: rate.error }, { status: 400 });

  const email    = body.email?.trim().toLowerCase() ?? '';
  const password = body.password?.trim() ?? '';
  const name     = body.name?.trim() ?? '';
  const username = body.username?.trim().toLowerCase() ?? '';
  const role     = body.role?.trim() || 'ic';
  const team     = body.team?.trim() || null;
  const memberCode = body.memberCode?.trim() || null;
  const jobTitle = body.jobTitle?.trim() || null;

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

  // 1. Create in Supabase Auth
  let authUserId: string;
  try {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) {
      if (error.message.toLowerCase().includes('already') || error.message.includes('exists')) {
        return NextResponse.json({ error: 'A user with that email already exists' }, { status: 409 });
      }
      return NextResponse.json({ error: `Supabase Auth error: ${error.message}` }, { status: 500 });
    }
    authUserId = data.user.id;
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
        is_active:  1,
        created_at: now,
        updated_at: now,
      })
      .select('id, username, name, email, role, team, job_title, member_code, hourly_rate_usd, is_active')
      .single();

    if (dbErr) throw new Error(dbErr.message);

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
}

export async function PATCH(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    id?: number;
    role?: string;
    isActive?: number;
    team?: string | null;
    memberCode?: string | null;
    hourlyRateUsd?: number | string | null;
  } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  // Admins cannot modify their own account through this endpoint
  if (body.id === session.id) {
    return NextResponse.json({ error: 'Use the profile page to edit your own account' }, { status: 403 });
  }

  if (body.role !== undefined && !VALID_ROLES.has(body.role)) {
    return NextResponse.json({ error: `Invalid role. Allowed: ${[...VALID_ROLES].join(', ')}` }, { status: 400 });
  }
  if (body.isActive !== undefined && body.isActive !== 0 && body.isActive !== 1) {
    return NextResponse.json({ error: 'isActive must be 0 or 1' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.role !== undefined)          updates.role           = body.role;
  if (body.isActive !== undefined)      updates.is_active      = body.isActive;
  if (body.team !== undefined)          updates.team           = body.team?.trim() || null;
  if (body.memberCode !== undefined)    updates.member_code    = body.memberCode?.trim() || null;
  if (body.hourlyRateUsd !== undefined) {
    const rate = parseHourlyRate(body.hourlyRateUsd);
    if (!rate.ok) return NextResponse.json({ error: rate.error }, { status: 400 });
    updates.hourly_rate_usd = rate.value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  const admin = createAdminClient();
  const { error: updateError } = await admin.from('users').update(updates).eq('id', body.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const { data: updated } = await admin
    .from('users')
    .select('id, username, name, email, role, team, job_title, member_code, hourly_rate_usd, is_active')
    .eq('id', body.id)
    .maybeSingle();

  if (!updated) return NextResponse.json({ error: 'User not found' }, { status: 404 });

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
    },
  });
}
