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
  users:                   { role: string } | { role: string }[] | null;
};

function rowRole(row: OpenRow): string {
  const u = row.users;
  if (Array.isArray(u)) return u[0]?.role ?? '';
  return u?.role ?? '';
}

// GET /api/cron/auto-clock-out
// Vercel cron hits this every minute. Closes open sessions that have:
//   * been clocked in > 3h + 5min
//   * no live consent extension (or the extension expired > 5min ago)
//   * a non-admin role (admin/ceo are exempt — they normalize to "admin")
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const now = new Date();

  // Pull every open session with the user's role joined in. The room is
  // small enough (10s of people) that filtering in JS is simpler than
  // building a date-math SQL filter that has to handle TZ correctly.
  const { data, error } = await admin
    .from('timesheets')
    .select('id, user_id, clocked_in_at, overtime_consent_until, users:user_id ( role )')
    .is('clocked_out_at', null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as OpenRow[];
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

    if (normalizeRole(rowRole(row)) === 'admin') {
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
