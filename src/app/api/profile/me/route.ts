import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verifyToken } from '@/lib/auth';
import { hash } from 'bcryptjs';
import { normalizeRole } from '@/lib/rbac';

async function requireSessionUserId() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  const userId = Number(payload?.id);
  if (!Number.isFinite(userId) || userId <= 0) return null;
  return userId;
}

export async function GET() {
  const userId = await requireSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: normalizeRole(user.role),
      team: user.team,
      jobTitle: user.jobTitle,
      isActive: Boolean(user.isActive),
    },
  });
}

export async function PUT(req: Request) {
  const userId = await requireSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json() as {
    name?: string;
    email?: string;
    team?: string;
    jobTitle?: string;
    password?: string;
  };

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const team = String(body.team || '').trim();
  const jobTitle = String(body.jobTitle || '').trim();
  const password = String(body.password || '');

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }
  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const payload: {
    name: string;
    email: string;
    team: string | null;
    jobTitle: string | null;
    updatedAt: string;
    passwordHash?: string;
  } = {
    name,
    email,
    team: team || null,
    jobTitle: jobTitle || null,
    updatedAt: new Date().toISOString(),
  };

  if (password) {
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }
    payload.passwordHash = await hash(password, 10);
  }

  try {
    await db.update(users).set(payload).where(eq(users.id, userId));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update profile';
    if (message.includes('users_email_unique')) {
      return NextResponse.json({ error: 'Email is already in use' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }

  const [updated] = await db.select().from(users).where(eq(users.id, userId));
  if (!updated) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    user: {
      id: updated.id,
      username: updated.username,
      name: updated.name,
      email: updated.email,
      role: normalizeRole(updated.role),
      team: updated.team,
      jobTitle: updated.jobTitle,
      isActive: Boolean(updated.isActive),
    },
  });
}
