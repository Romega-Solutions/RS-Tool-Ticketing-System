import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeRole, isGateableToolKey, type AppRole } from '@/lib/rbac';

export type SessionUser = {
<<<<<<< HEAD
=======
  isImpersonating:boolean;
>>>>>>> parent of 5bf057f (fixed build errors and only admin can impersonate)
  id: number;
  email: string;
  name: string;
  username: string;
  role: AppRole;
  team: string | null;
  jobTitle: string | null;
  isOnboarding: boolean;
  toolAccess: string[];
};

// Wrapped in React.cache so the two network round-trips (Supabase auth.getUser
// + the public.users lookup) run at most ONCE per server request, even though
// the layout, the page, and any server action all call getSession(). This alone
// removes a large chunk of per-navigation latency across every page.
export const getSession = cache(async (): Promise<SessionUser | null> => {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) return null;

    const admin = createAdminClient();
    const { data: dbUser } = await admin
      .from('users')
      .select('id, email, name, username, role, team, job_title, is_active, is_onboarding, tool_access')
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
      isOnboarding: Boolean(dbUser.is_onboarding),
      toolAccess: Array.isArray(dbUser.tool_access)
        ? (dbUser.tool_access as unknown[]).filter(isGateableToolKey)
        : [],
    };
  } catch {
    return null;
  }
});
