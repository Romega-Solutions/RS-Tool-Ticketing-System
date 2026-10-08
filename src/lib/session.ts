import { cache } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeRole, isGateableToolKey, type AppRole } from '@/lib/rbac';

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  username: string;
  role: AppRole;
  team: string | null;
  jobTitle: string | null;
  isOnboarding: boolean;
  toolAccess: string[];
  // Set when an admin is viewing the app as this user: the real admin's
  // users.id. Every other field describes the viewed user.
  impersonatedBy?: number;
};

// Holds the users.id an admin chose to view as. Deliberately unsigned: it only
// selects a target — whether it's honored is decided on every request from the
// real Supabase login (admin) and the target row (active, not an admin).
export const VIEW_AS_COOKIE = 'rs-view-as';

type UserRow = {
  id: number; email: string; name: string; username: string; role: string;
  team: string | null; job_title: string | null; is_active: number | boolean;
  is_onboarding: number | boolean; tool_access: unknown;
};

const USER_COLUMNS = 'id, email, name, username, role, team, job_title, is_active, is_onboarding, tool_access';

function toSessionUser(row: UserRow): SessionUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    username: row.username,
    role: normalizeRole(row.role),
    team: row.team ?? null,
    jobTitle: row.job_title ?? null,
    isOnboarding: Boolean(row.is_onboarding),
    toolAccess: Array.isArray(row.tool_access)
      ? (row.tool_access as unknown[]).filter(isGateableToolKey)
      : [],
  };
}

// Admins may view as any active non-admin other than themselves — so viewing
// can never reach more access than the admin already has.
export function canViewAs(viewer: { id: number; role: AppRole }, target: UserRow): boolean {
  return viewer.role === 'admin'
    && target.id !== viewer.id
    && Boolean(target.is_active)
    && normalizeRole(target.role) !== 'admin';
}

export async function fetchUserRowById(id: number): Promise<UserRow | null> {
  const { data } = await createAdminClient()
    .from('users')
    .select(USER_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  return (data as UserRow | null) ?? null;
}

async function resolveViewAs(real: SessionUser): Promise<SessionUser | null> {
  if (real.role !== 'admin') return null;
  const raw = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  const targetId = Number(raw);
  if (!raw || !Number.isInteger(targetId) || targetId <= 0) return null;

  const target = await fetchUserRowById(targetId);
  if (!target || !canViewAs(real, target)) return null;
  return { ...toSessionUser(target), impersonatedBy: real.id };
}

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
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return { user: null, reason: 'no_session' };

  const admin = createAdminClient();
  const { data: dbUser } = await admin
    .from('users')
    .select(USER_COLUMNS)
    .eq('email', user.email)
    .maybeSingle();

  if (!dbUser) return { user: null, reason: 'no_row' };
  if (!dbUser.is_active) return { user: null, reason: 'inactive' };

  const real = toSessionUser(dbUser as UserRow);
  return { reason: null, user: (await resolveViewAs(real)) ?? real };
}

// Cached per-request (React.cache) so layout/page/action calls to either
// getSession() or getSessionResult() share the same single network round-trip.
export const getSessionResult = cache(async (): Promise<SessionResult> => {
  try {
    return await withTimeout(fetchSessionResult(), SESSION_TIMEOUT_MS);
  } catch (err) {
    // fetchSessionResult() calls cookies() under the hood — during static
    // generation Next signals "this route needs per-request rendering" by
    // throwing through that call. A bare catch here would swallow that
    // signal along with real errors, silently defeating Next's automatic
    // dynamic-rendering detection for every page that calls getSession().
    unstable_rethrow(err);
    const reason = err instanceof Error && err.message === 'getSession timed out' ? 'timeout' : 'error';
    return { user: null, reason };
  }
});

export const getSession = cache(async (): Promise<SessionUser | null> => {
  return (await getSessionResult()).user;
});
