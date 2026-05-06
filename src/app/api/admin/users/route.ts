import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { canAccessAdmin } from '@/lib/rbac';
import { createAdminClient } from '@/lib/supabase/admin';
import { hash } from 'bcryptjs';

export const runtime = 'nodejs';

async function requireAdmin() {
  const session = await getSession();
  if (!session || !canAccessAdmin(session.role)) return null;
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: allUsers = [] } = await admin
    .from('users')
    .select('id, username, name, email, role, team, job_title, plane_member_id, is_active')
    .order('name');

  const mapped = allUsers.map((u: Record<string, unknown>) => ({
    id:            u.id,
    username:      u.username,
    name:          u.name,
    email:         u.email,
    role:          u.role,
    team:          u.team,
    jobTitle:      u.job_title,
    planeMemberId: u.plane_member_id,
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
  } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email    = body.email?.trim().toLowerCase() ?? '';
  const password = body.password?.trim() ?? '';
  const name     = body.name?.trim() ?? '';
  const username = body.username?.trim().toLowerCase() ?? '';
  const role     = body.role?.trim() || 'ic';
  const team     = body.team?.trim() || null;
  const jobTitle = body.jobTitle?.trim() || null;

  if (!email || !password || !name || !username) {
    return NextResponse.json(
      { error: 'email, password, name, and username are all required' },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
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
        job_title:  jobTitle,
        is_active:  1,
        created_at: now,
        updated_at: now,
      })
      .select('id, username, name, email, role, team, job_title, plane_member_id, is_active')
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
        planeMemberId: inserted.plane_member_id,
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

  let body: { id?: number; role?: string; planeMemberId?: string | null; isActive?: number } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (body.role !== undefined)          updates.role           = body.role;
  if (body.planeMemberId !== undefined) updates.plane_member_id = body.planeMemberId || null;
  if (body.isActive !== undefined)      updates.is_active      = body.isActive;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  const admin = createAdminClient();
  const { error: updateError } = await admin.from('users').update(updates).eq('id', body.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const { data: updated } = await admin
    .from('users')
    .select('id, username, name, email, role, team, job_title, plane_member_id, is_active')
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
      planeMemberId: updated.plane_member_id,
      isActive:      Boolean(updated.is_active),
    },
  });
}
