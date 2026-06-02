import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { clockOut } from '@/lib/presence';
import { computeOvertime } from '@/lib/utils';
import { decideAutoClockOut, weekDates } from '@/lib/overtime-policy';

export const runtime = 'nodejs';

type OpenRow = {
  id:            number;
  user_id:       number;
  clocked_in_at: string;
};

// GET /api/cron/auto-clock-out
// Hit on a schedule (Vercel cron daily + an n8n trigger every minute for tight
// enforcement). Closes open sessions per the overtime policy:
//   * 15h Mon–Sun weekly cap (non-admins) — there is no per-session/day cap
//   * 16h absolute safety ceiling (every role, incl. admin — ghost-session guard)
// An active admin overtime approval suspends the weekly cap for that user.
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });
  }
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();

  const { data: openRows, error: openErr } = await admin
    .from('timesheets')
    .select('id, user_id, clocked_in_at')
    .is('clocked_out_at', null);

  if (openErr) {
    return NextResponse.json({ error: openErr.message }, { status: 500 });
  }

  const rows = (openRows ?? []) as OpenRow[];
  const userIds = [...new Set(rows.map(r => r.user_id))];

  const roleByUserId      = new Map<number, string>();
  const weekSecByUserId   = new Map<number, number>();
  const approvalByUserId  = new Map<number, string>();

  if (userIds.length > 0) {
    // Roles
    const { data: users, error: userErr } = await admin
      .from('users')
      .select('id, role')
      .in('id', userIds);
    if (userErr) return NextResponse.json({ error: userErr.message }, { status: 500 });
    for (const u of (users ?? []) as { id: number; role: string }[]) {
      roleByUserId.set(u.id, u.role);
    }

    // Completed seconds this week (Mon–Sun) per user — open sessions have a
    // null duration so they're naturally excluded and counted via elapsed.
    const { data: ts, error: tsErr } = await admin
      .from('timesheets')
      .select('user_id, duration_seconds')
      .in('user_id', userIds)
      .in('date', weekDates(now))
      .not('duration_seconds', 'is', null);
    if (tsErr) return NextResponse.json({ error: tsErr.message }, { status: 500 });
    for (const t of (ts ?? []) as { user_id: number; duration_seconds: number }[]) {
      weekSecByUserId.set(t.user_id, (weekSecByUserId.get(t.user_id) ?? 0) + t.duration_seconds);
    }

    // Latest active overtime approval per user. Non-fatal: if the table isn't
    // migrated yet, treat everyone as unapproved so enforcement still runs.
    const { data: appr, error: apprErr } = await admin
      .from('overtime_requests')
      .select('user_id, approved_until')
      .in('user_id', userIds)
      .eq('status', 'approved')
      .not('approved_until', 'is', null);
    if (apprErr) console.error('[auto-clock-out] approval lookup failed (continuing):', apprErr.message);
    for (const a of (appr ?? []) as { user_id: number; approved_until: string }[]) {
      const prev = approvalByUserId.get(a.user_id);
      if (!prev || new Date(a.approved_until).getTime() > new Date(prev).getTime()) {
        approvalByUserId.set(a.user_id, a.approved_until);
      }
    }
  }

  const closed:  Array<{ userId: number; durationSeconds: number; reason: string }> = [];
  const skipped: Array<{ userId: number; reason: string }> = [];

  for (const row of rows) {
    const decision = decideAutoClockOut({
      role:              roleByUserId.get(row.user_id),
      clockedInAt:       row.clocked_in_at,
      weekSecondsBefore: weekSecByUserId.get(row.user_id) ?? 0,
      approvedUntil:     approvalByUserId.get(row.user_id) ?? null,
      now,
    });

    if (decision.action === 'skip') {
      skipped.push({ userId: row.user_id, reason: decision.reason });
      continue;
    }

    const elapsedSec = decision.elapsedSec;
    const { isOvertime, overtimeSeconds } = computeOvertime(weekSecByUserId.get(row.user_id) ?? 0, elapsedSec);
    const { error: upErr } = await admin
      .from('timesheets')
      .update({
        clocked_out_at:   now.toISOString(),
        duration_seconds: elapsedSec,
        is_overtime:      isOvertime ? 1 : 0,
        overtime_seconds: isOvertime ? overtimeSeconds : null,
      })
      .eq('id', row.id);

    if (upErr) {
      skipped.push({ userId: row.user_id, reason: `update failed: ${upErr.message}` });
      continue;
    }

    clockOut(row.user_id);
    closed.push({ userId: row.user_id, durationSeconds: elapsedSec, reason: decision.reason });
  }

  return NextResponse.json({ ranAt: now.toISOString(), closed, skipped });
}
