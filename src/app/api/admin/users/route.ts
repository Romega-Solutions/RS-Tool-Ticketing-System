import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { canAccessAdmin } from '@/lib/rbac';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

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

export async function GET() {
  const session = await getSession();
  if (!session || !canAccessAdmin(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const allUsers = await db.select(USER_FIELDS).from(users).orderBy(users.name);
  return NextResponse.json({ users: allUsers });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session || !canAccessAdmin(session.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
