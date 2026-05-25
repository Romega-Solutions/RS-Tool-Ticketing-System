import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { clockOut } from '@/lib/presence';
import { computeOvertime, OVERTIME_THRESHOLD_SECONDS } from '@/lib/utils';
import { normalizeRole } from '@/lib/rbac';

export const runtime = 'nodejs';

// Grace window after the overtime prompt before we close the session.
// Mirrors OVERTIME_RESPONSE_WINDOW_SECONDS in the browser widget.
const RESPONSE_WINDOW_SECONDS = 5 * 60;

type OpenRow = {
  id:                      number;
  user_id:                 number;
  clocked_in_at:           string;
  overtime_consent_until:  string | null;
};

// GET /api/cron/auto-clock-out
// Hit on a schedule (Vercel cron daily on Hobby plan, plus an n8n trigger
// every minute for tight enforcement). Closes open sessions that have:
//   * been clocked in > 3h + 5min
//   * no live consent extension (or the extension expired > 5min ago)
//   * a non-admin role (admin/ceo are exempt — they normalize to "admin")
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

  // Pull every open session, then fetch the matching users in one extra
  // round-trip. We avoid the PostgREST embed because there is no FK between
  // timesheets.user_id and users.id in this DB.
  const { data: openRows, error: openErr } = await admin
    .from('timesheets')
    .select('id, user_id, clocked_in_at, overtime_consent_until')
    .is('clocked_out_at', null);

  if (openErr) {
    return NextResponse.json({ error: openErr.message }, { status: 500 });
  }

  const rows = (openRows ?? []) as OpenRow[];
  const userIds = [...new Set(rows.map(r => r.user_id))];
  const roleByUserId = new Map<number, string>();
  if (userIds.length > 0) {
    const { data: users, error: userErr } = await admin
      .from('users')
      .select('id, role')
      .in('id', userIds);
    if (userErr) {
      return NextResponse.json({ error: userErr.message }, { status: 500 });
    }
    for (const u of (users ?? []) as { id: number; role: string }[]) {
      roleByUserId.set(u.id, u.role);
    }
  }
  const closed: Array<{ userId: number; durationSeconds: number }> = [];
  const skipped: Array<{ userId: number; reason: string }> = [];

  for (const row of rows) {
    const clockedInMs = new Date(row.clocked_in_at).getTime();
    if (!Number.isFinite(clockedInMs)) {
      skipped.push({ userId: row.user_id, reason: 'invalid clocked_in_at' });
      continue;
    }

    const elapsedSec = Math.round((now.getTime() - clockedInMs) / 1000);
    if (elapsedSec < OVERTIME_THRESHOLD_SECONDS + RESPONSE_WINDOW_SECONDS) {
      skipped.push({ userId: row.user_id, reason: 'within response window' });
      continue;
    }

    if (normalizeRole(roleByUserId.get(row.user_id) ?? '') === 'admin') {
      skipped.push({ userId: row.user_id, reason: 'admin/ceo exempt' });
      continue;
    }

    if (row.overtime_consent_until) {
      const consentMs = new Date(row.overtime_consent_until).getTime();
      if (Number.isFinite(consentMs) && now.getTime() < consentMs + RESPONSE_WINDOW_SECONDS * 1000) {
        skipped.push({ userId: row.user_id, reason: 'consent active' });
        continue;
      }
    }

    const outIso = now.toISOString();
    const { isOvertime, overtimeSeconds } = computeOvertime(elapsedSec);
    const { error: upErr } = await admin
      .from('timesheets')
      .update({
        clocked_out_at:   outIso,
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
    closed.push({ userId: row.user_id, durationSeconds: elapsedSec });
  }

  return NextResponse.json({ ranAt: now.toISOString(), closed, skipped });
}
