import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeRole, type AppRole } from '@/lib/rbac';

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  username: string;
  role: AppRole;
  team: string | null;
  jobTitle: string | null;
};

export async function getSession(): Promise<SessionUser | null> {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) return null;

    const admin = createAdminClient();
    const { data: dbUser } = await admin
      .from('users')
      .select('id, email, name, username, role, team, job_title, is_active')
      .eq('email', user.email)
      .maybeSingle();

    if (!dbUser || !dbUser.is_active) return null;

    return {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      username: dbUser.username,
      role: normalizeRole(dbUser.role),
      team: dbUser.team ?? null,
      jobTitle: dbUser.job_title ?? null,
    };
  } catch {
    return null;
  }
}
