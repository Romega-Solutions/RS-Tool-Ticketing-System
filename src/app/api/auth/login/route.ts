import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { compare } from 'bcryptjs';
import { db } from '@/db';
import { users } from '@/db/schema';
import { signToken } from '@/lib/auth';
import { defaultLandingPath, normalizeRole } from '@/lib/rbac';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json() as { username?: string; password?: string };
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    const [user] = await db.select().from(users).where(eq(users.username, username));

    if (!user || !user.isActive) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    const isValidPassword = await compare(password, user.passwordHash);
    if (!isValidPassword) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    const role = normalizeRole(user.role);
    const token = await signToken({ id: user.id, username: user.username, role });

    const cookieStore = await cookies();
    cookieStore.set('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return NextResponse.json({
      success: true,
      role,
      redirectPath: defaultLandingPath(role),
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role,
        team: user.team,
        jobTitle: user.jobTitle,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[login] 500 error:', message);
    return NextResponse.json(
      { error: 'Internal server error', detail: message },
      { status: 500 },
    );
  }
}
