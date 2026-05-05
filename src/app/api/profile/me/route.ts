import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { hash } from 'bcryptjs';
import { normalizeRole } from '@/lib/rbac';

export const runtime = 'nodejs';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [user] = await db.select().from(users).where(eq(users.id, session.id));
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: normalizeRole(user.role),
      team: user.team,
      jobTitle: user.jobTitle,
      planeMemberId: user.planeMemberId ?? null,
      isActive: Boolean(user.isActive),
    },
  });
}

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    name?: string;
    team?: string;
    jobTitle?: string;
    password?: string;
  };

  const name = String(body.name || '').trim();
  const team = String(body.team || '').trim();
  const jobTitle = String(body.jobTitle || '').trim();
  const password = String(body.password || '');

  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const payload: {
    name: string;
    team: string | null;
    jobTitle: string | null;
    updatedAt: string;
    passwordHash?: string;
  } = {
    name,
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

  await db.update(users).set(payload).where(eq(users.id, session.id));

  const [updated] = await db.select().from(users).where(eq(users.id, session.id));
  if (!updated) return NextResponse.json({ error: 'User not found' }, { status: 404 });

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
