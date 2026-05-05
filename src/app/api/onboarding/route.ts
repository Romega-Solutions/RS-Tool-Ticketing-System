import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    name?: string;
    team?: string;
    jobTitle?: string;
    role?: string;
  };

  const name     = body.name?.trim() ?? '';
  const team     = body.team?.trim() || null;
  const jobTitle = body.jobTitle?.trim() || null;
  const role     = body.role?.trim() || 'ic';

  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  // Users can only self-assign ic or lead — admin/ceo requires admin action
  const selfAssignableRole = ['ic', 'lead'].includes(role) ? role : 'ic';

  const now = new Date().toISOString();
  const email = user.email;
  const emailPrefix = email.split('@')[0].replace(/[^a-z0-9_]/gi, '_').toLowerCase();

  const [existing] = await db.select({ id: users.id, role: users.role })
    .from(users).where(eq(users.email, email));

  if (existing) {
    // Preserve role if they're already admin/ceo — never self-downgrade
    const protectedRoles = ['admin', 'ceo', 'owner', 'superadmin'];
    const finalRole = protectedRoles.includes(existing.role.toLowerCase())
      ? existing.role
      : selfAssignableRole;

    await db.update(users)
      .set({ name, team, jobTitle, role: finalRole, updatedAt: now })
      .where(eq(users.id, existing.id));
  } else {
    // First time — create the row (fallback if callback didn't create it)
    await db.insert(users).values({
      username:     emailPrefix,
      passwordHash: '',
      name,
      email,
      role:         selfAssignableRole,
      team,
      jobTitle,
      isActive:     1,
      createdAt:    now,
      updatedAt:    now,
    }).onConflictDoNothing();
  }

  return NextResponse.json({ success: true });
}
