import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { canAccessAdmin } from '@/lib/rbac';
import { createAdminClient } from '@/lib/supabase/admin';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { hash } from 'bcryptjs';

export const runtime = 'nodejs';

const USER_FIELDS = {
  id:            users.id,
  username:      users.username,
  name:          users.name,
  email:         users.email,
  role:          users.role,
  team:          users.team,
  jobTitle:      users.jobTitle,
  planeMemberId: users.planeMemberId,
  isActive:      users.isActive,
} as const;

async function requireAdmin() {
  const session = await getSession();
  if (!session || !canAccessAdmin(session.role)) return null;
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const allUsers = await db.select(USER_FIELDS).from(users).orderBy(users.name);
  return NextResponse.json({ users: allUsers });
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

  // 1. Create in Supabase Auth
  let authUserId: string;
  try {
    const admin = createAdminClient();
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
    const [inserted] = await db
      .insert(users)
      .values({
        username,
        passwordHash,
        name,
        email,
        role,
        team,
        jobTitle,
        isActive: 1,
        createdAt: now,
        updatedAt: now,
      })
      .returning(USER_FIELDS);

    return NextResponse.json({ user: inserted }, { status: 201 });
  } catch (err) {
    // Roll back the Supabase Auth user if DB insert fails
    try {
      const admin = createAdminClient();
      await admin.auth.admin.deleteUser(authUserId);
    } catch { /* best-effort rollback */ }

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
  if (body.role !== undefined)          updates.role          = body.role;
  if (body.planeMemberId !== undefined) updates.planeMemberId = body.planeMemberId || null;
  if (body.isActive !== undefined)      updates.isActive      = body.isActive;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  await db.update(users).set(updates).where(eq(users.id, body.id));
  const [updated] = await db.select(USER_FIELDS).from(users).where(eq(users.id, body.id));
  return NextResponse.json({ user: updated });
}
