import { createClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { normalizeRole, type AppRole } from '@/lib/rbac';

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  username: string;
  role: AppRole;
  team: string | null;
  jobTitle: string | null;
  planeMemberId: string | null;
};

export async function getSession(): Promise<SessionUser | null> {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) return null;

    const [dbUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, user.email));

    if (!dbUser || !dbUser.isActive) return null;

    return {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      username: dbUser.username,
      role: normalizeRole(dbUser.role),
      team: dbUser.team ?? null,
      jobTitle: dbUser.jobTitle ?? null,
      planeMemberId: dbUser.planeMemberId ?? null,
    };
  } catch {
    return null;
  }
}
