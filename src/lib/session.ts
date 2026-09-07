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

// Bounds how long a single getSession() call can take. Without this, a slow
// Supabase auth endpoint (JWKS fetch / user lookup) hangs every route that
// calls getSession() — which is nearly all of them — up to the platform's
// max function duration instead of failing fast to a logged-out state.
const SESSION_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('getSession timed out')), ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      err => { clearTimeout(timer); reject(err); },
    );
  });
}

// Why getSession() came back without a user — lets callers that need to
// explain a logged-out state (e.g. the app layout's redirect to /login) show
// an accurate reason instead of re-running their own unguarded Supabase calls
// to guess. 'timeout' specifically means the auth provider didn't respond in
// time; it is not the same thing as a deactivated account.
export type SessionFailureReason = 'no_session' | 'no_row' | 'inactive' | 'timeout' | 'error';

export type SessionResult =
  | { user: SessionUser; reason: null }
  | { user: null; reason: SessionFailureReason };

async function fetchSessionResult(): Promise<SessionResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return { user: null, reason: 'no_session' };

  const claims = data.claims as {
    sub: string;
    email: string;
    impersonating_subject?: string;
    effective_user?: { id: string; email: string; full_name: string; role: string };
  };

  const lookupEmail = claims.effective_user?.email ?? claims.email;
  if (!lookupEmail) return { user: null, reason: 'no_session' };

  const admin = createAdminClient();
  const { data: dbUser } = await admin
    .from('users')
    .select('id, email, name, username, role, team, job_title, is_active, is_onboarding, tool_access, approved_hours_per_week')
    .eq('email', lookupEmail)
    .maybeSingle();

  if (!dbUser) return { user: null, reason: 'no_row' };
  if (!dbUser.is_active) return { user: null, reason: 'inactive' };

  if (normalizeRole(dbUser.role) === "admin") {
    return {
      reason: null,
      user: {
        isImpersonating: Boolean(claims.effective_user),
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
        approvedHours: dbUser.approved_hours_per_week
      },
    };
  } else {
    return {
      reason: null,
      user: {
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
        approvedHours: dbUser.approved_hours_per_week
      },
    };
  }
}

// Cached per-request (React.cache) so layout/page/action calls to either
// getSession() or getSessionResult() share the same single network round-trip.
export const getSessionResult = cache(async (): Promise<SessionResult> => {
  try {
    return await withTimeout(fetchSessionResult(), SESSION_TIMEOUT_MS);
  } catch (err) {
    const reason = err instanceof Error && err.message === 'getSession timed out' ? 'timeout' : 'error';
    return { user: null, reason };
  }
});

export const getSession = cache(async (): Promise<SessionUser | null> => {
  return (await getSessionResult()).user;
});