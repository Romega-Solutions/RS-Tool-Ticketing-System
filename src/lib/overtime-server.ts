import { createAdminClient } from './supabase/admin';
import { weekDates } from './overtime-policy';

// Server-only data helpers for the overtime policy. Kept out of the pure
// `overtime-policy` module so that stays I/O-free and unit-testable.

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Completed (clocked-out) seconds for a user across the Mon–Sun week of `now`.
 * Pass `excludeTimesheetId` to leave one row out (used when re-deriving overtime
 * for the very row being edited).
 */
export async function weeklySecondsForUser(
  admin: Admin,
  userId: number,
  now: Date,
  excludeTimesheetId?: number,
): Promise<number> {
  let query = admin
    .from('timesheets')
    .select('id, duration_seconds')
    .eq('user_id', userId)
    .in('date', weekDates(now))
    .not('duration_seconds', 'is', null);
  if (excludeTimesheetId != null) query = query.neq('id', excludeTimesheetId);
  const { data } = await query;
  let sum = 0;
  for (const t of (data ?? []) as { duration_seconds: number }[]) sum += t.duration_seconds ?? 0;
  return sum;
}

/** Completed seconds this Mon–Sun week for many users at once (batched). */
export async function weeklySecondsForUsers(
  admin: Admin,
  userIds: number[],
  now: Date,
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (userIds.length === 0) return out;
  const { data } = await admin
    .from('timesheets')
    .select('user_id, duration_seconds')
    .in('user_id', userIds)
    .in('date', weekDates(now))
    .not('duration_seconds', 'is', null);
  for (const t of (data ?? []) as { user_id: number; duration_seconds: number }[]) {
    out.set(t.user_id, (out.get(t.user_id) ?? 0) + (t.duration_seconds ?? 0));
  }
  return out;
}

/** Latest active overtime approval timestamp for a user, or null. */
export async function activeApprovalUntil(admin: Admin, userId: number): Promise<string | null> {
  const { data } = await admin
    .from('overtime_requests')
    .select('approved_until')
    .eq('user_id', userId)
    .eq('status', 'approved')
    .not('approved_until', 'is', null)
    .order('approved_until', { ascending: false })
    .limit(1);
  return (data?.[0]?.approved_until as string | undefined) ?? null;
}
