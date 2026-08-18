import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeRole, isGateableToolKey, type AppRole } from '@/lib/rbac';

export type SessionUser = {
  isImpersonating?:boolean;
  id: number;
  email: string;
  name: string;
  username: string;
  role: AppRole;
  team: string | null;
  jobTitle: string | null;
  isOnboarding: boolean;
  toolAccess: string[];
  approvedHours:number;
};

// Wrapped in React.cache so the two network round-trips (Supabase auth.getUser
// + the public.users lookup) run at most ONCE per server request, even though
// the layout, the page, and any server action all call getSession(). This alone
// removes a large chunk of per-navigation latency across every page.
// export const getSession = cache(async (): Promise<SessionUser | null> => {
//   try {
//     const supabase = await createClient();
//     const { data: { user }, error } = await supabase.auth.getUser();
//     if (error || !user?.email) return null;

//     const admin = createAdminClient();
//     const { data: dbUser } = await admin
//       .from('users')
//       .select('id, email, name, username, role, team, job_title, is_active, is_onboarding, tool_access')
//       .eq('email', user.email)
//       .maybeSingle();


//     if (!dbUser || !dbUser.is_active) return null;

//     return {
//       id: dbUser.id,
//       email: dbUser.email,
//       name: dbUser.name,
//       username: dbUser.username,
//       role: normalizeRole(dbUser.role),
//       team: dbUser.team ?? null,
//       jobTitle: dbUser.job_title ?? null,
//       isOnboarding: Boolean(dbUser.is_onboarding),
//       toolAccess: Array.isArray(dbUser.tool_access)
//         ? (dbUser.tool_access as unknown[]).filter(isGateableToolKey)
//         : [],
//     };
//   } catch {
//     return null;
//   }
// });

export const getSession = cache(async (): Promise<SessionUser | null> => {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims) return null;

    const claims = data.claims as {
      sub: string;
      email: string;
      impersonating_subject?: string;
      effective_user?: { id: string; email: string; full_name: string; role: string };
    };

    const lookupEmail = claims.effective_user?.email ?? claims.email;
    if (!lookupEmail) return null;

    const admin = createAdminClient();
    const { data: dbUser } = await admin
      .from('users')
      .select('id, email, name, username, role, team, job_title, is_active, is_onboarding, tool_access, approved_hours_per_week')
      .eq('email', lookupEmail)
      .maybeSingle();

    if (!dbUser || !dbUser.is_active) return null;

    if (dbUser.role === "admin"){
      return {
        isImpersonating:Boolean(claims.effective_user),
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
        approvedHours:dbUser.approved_hours_per_week
      };
    }else{
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
        approvedHours:dbUser.approved_hours_per_week
      };
    }
  
  } catch {
    return null;
  }
});