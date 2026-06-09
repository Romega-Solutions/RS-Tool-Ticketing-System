import { createAdminClient } from './supabase/admin';
import { weekDates, planEnforcement } from './overtime-policy';
import { clockOut } from './presence';
import { HttpError } from './api/errors';

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

/**
 * Close-on-read enforcement. If `userId` has an open session that the weekly-cap
 * policy says must end now, close it server-side immediately — write
 * clocked_out_at + duration + overtime and drop them from in-memory presence.
 * Returns the close result, or null when there was nothing to close.
 *
 * This is what makes the 15h cap real without trusting the browser guardrail or
 * waiting for the daily cron: call it on any presence read and merely using the
 * app enforces the cap. It only writes when a session is genuinely over.
 */
export async function enforceUserOpenSession(
  admin: Admin,
  userId: number,
  now: Date,
): Promise<{ closed: true; durationSeconds: number; reason: string } | null> {
  const { data: open } = await admin
    .from('timesheets')
    .select('id, clocked_in_at')
    .eq('user_id', userId)
    .is('clocked_out_at', null)
    .maybeSingle();
  if (!open) return null;

  const [{ data: user }, weekSecondsBefore, approvedUntil] = await Promise.all([
    admin.from('users').select('role').eq('id', userId).maybeSingle(),
    weeklySecondsForUser(admin, userId, now),
    activeApprovalUntil(admin, userId),
  ]);

  const plan = planEnforcement({
    role:              (user?.role as string | undefined) ?? null,
    clockedInAt:       open.clocked_in_at as string,
    weekSecondsBefore,
    approvedUntil,
    now,
  });
  if (!plan.close) return null;

  const { error } = await admin
    .from('timesheets')
    .update({
      clocked_out_at:   now.toISOString(),
      duration_seconds: plan.durationSeconds,
      is_overtime:      plan.isOvertime ? 1 : 0,
      overtime_seconds: plan.overtimeSeconds,
    })
    .eq('id', open.id);
  if (error) {
    console.error('[enforceUserOpenSession] update failed:', error.message);
    return null;
  }

  clockOut(userId);
  return { closed: true, durationSeconds: plan.durationSeconds, reason: plan.reason };
}

type SweepResult = {
  closed:  Array<{ userId: number; durationSeconds: number; reason: string }>;
  skipped: Array<{ userId: number; reason: string }>;
};

/**
 * Batched weekly-cap sweep: close every open session the policy says must end
 * now (15h weekly cap for non-admins, 16h absolute ceiling for everyone; an
 * active admin approval suspends the weekly cap). This is the SINGLE sweep used
 * by both the daily cron and the throttled activity backstop, so the cap is
 * enforced identically no matter what triggers it.
 */
export async function sweepOpenSessions(admin: Admin, now: Date): Promise<SweepResult> {
  const { data: openRows, error: openErr } = await admin
    .from('timesheets')
    .select('id, user_id, clocked_in_at')
    .is('clocked_out_at', null);
  if (openErr) throw new HttpError(500, openErr.message);

  const rows = (openRows ?? []) as { id: number; user_id: number; clocked_in_at: string }[];
  const userIds = [...new Set(rows.map(r => r.user_id))];

  const roleByUserId     = new Map<number, string>();
  const weekSecByUserId  = new Map<number, number>();
  const approvalByUserId = new Map<number, string>();

  if (userIds.length > 0) {
    const { data: users, error: userErr } = await admin
      .from('users').select('id, role').in('id', userIds);
    if (userErr) throw new HttpError(500, userErr.message);
    for (const u of (users ?? []) as { id: number; role: string }[]) {
      roleByUserId.set(u.id, u.role);
    }

    // Completed seconds this Mon–Sun per user (open sessions have null duration
    // so they're naturally excluded and counted via elapsed in planEnforcement).
    const { data: ts, error: tsErr } = await admin
      .from('timesheets')
      .select('user_id, duration_seconds')
      .in('user_id', userIds)
      .in('date', weekDates(now))
      .not('duration_seconds', 'is', null);
    if (tsErr) throw new HttpError(500, tsErr.message);
    for (const t of (ts ?? []) as { user_id: number; duration_seconds: number }[]) {
      weekSecByUserId.set(t.user_id, (weekSecByUserId.get(t.user_id) ?? 0) + t.duration_seconds);
    }

    // Latest active overtime approval per user. Non-fatal: if the lookup fails,
    // treat everyone as unapproved so enforcement still runs.
    const { data: appr, error: apprErr } = await admin
      .from('overtime_requests')
      .select('user_id, approved_until')
      .in('user_id', userIds)
      .eq('status', 'approved')
      .not('approved_until', 'is', null);
    if (apprErr) console.error('[sweepOpenSessions] approval lookup failed (continuing):', apprErr.message);
    for (const a of (appr ?? []) as { user_id: number; approved_until: string }[]) {
      const prev = approvalByUserId.get(a.user_id);
      if (!prev || new Date(a.approved_until).getTime() > new Date(prev).getTime()) {
        approvalByUserId.set(a.user_id, a.approved_until);
      }
    }
  }

  const closed:  SweepResult['closed']  = [];
  const skipped: SweepResult['skipped'] = [];

  for (const row of rows) {
    const plan = planEnforcement({
      role:              roleByUserId.get(row.user_id),
      clockedInAt:       row.clocked_in_at,
      weekSecondsBefore: weekSecByUserId.get(row.user_id) ?? 0,
      approvedUntil:     approvalByUserId.get(row.user_id) ?? null,
      now,
    });

    if (!plan.close) {
      skipped.push({ userId: row.user_id, reason: plan.reason });
      continue;
    }

    const { error: upErr } = await admin
      .from('timesheets')
      .update({
        clocked_out_at:   now.toISOString(),
        duration_seconds: plan.durationSeconds,
        is_overtime:      plan.isOvertime ? 1 : 0,
        overtime_seconds: plan.overtimeSeconds,
      })
      .eq('id', row.id);

    if (upErr) {
      skipped.push({ userId: row.user_id, reason: `update failed: ${upErr.message}` });
      continue;
    }

    clockOut(row.user_id);
    closed.push({ userId: row.user_id, durationSeconds: plan.durationSeconds, reason: plan.reason });
  }

  return { closed, skipped };
}

// Throttle so app activity can drive the sweep without running it on every
// request. Module-level state persists across requests on a warm (reused)
// serverless instance; separate instances each sweep independently and
// idempotently. ~60s keeps the cap honest without hammering the DB.
let lastSweepAt = 0;
const SWEEP_THROTTLE_MS = 60_000;

/**
 * Activity-driven backstop. Runs the full sweep at most once per throttle
 * window. Call from frequently-hit presence endpoints so a user who clocks in
 * and then walks away (never reloading the app) is still capped within ~60s as
 * long as *anyone* is using the app — without waiting for the daily cron. Never
 * throws; failures are logged so the presence response is unaffected.
 */
export async function maybeSweepOpenSessions(admin: Admin, now: Date): Promise<void> {
  if (now.getTime() - lastSweepAt < SWEEP_THROTTLE_MS) return;
  lastSweepAt = now.getTime(); // claim the window before awaiting to avoid stampedes
  try {
    await sweepOpenSessions(admin, now);
  } catch (err) {
    console.error('[maybeSweepOpenSessions] sweep failed:', err instanceof Error ? err.message : err);
  }
}
