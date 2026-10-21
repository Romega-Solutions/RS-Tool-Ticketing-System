import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { route, requireBearer } from '@/lib/api';
import { notifyTimeEditReminder } from '@/lib/notifications';
import { needsSupervisorReminder } from '@/lib/time-approvals';
import { fmtDateLabel } from '@/lib/time-approvals-server';

export const runtime = 'nodejs';

// GET /api/cron/time-edit-reminders
// Weekday Vercel cron: a time-correction request that has waited on the
// supervisor for 2 working days (Mon–Fri, Manila time) sends that supervisor
// one in-app reminder. supervisor_reminded_at is stamped first, so a re-run
// (or an overlapping run) never reminds twice.
export const GET = route(async (req: Request) => {
  requireBearer(req, process.env.CRON_SECRET);

  const sb = createAdminClient();
  const now = new Date();

  const { data: rows, error } = await sb.from('timesheet_edit_requests')
    .select('id, user_id, date, status, stage, supervisor_id, requested_at, supervisor_reminded_at')
    .eq('status', 'pending')
    .eq('stage', 'supervisor')
    .not('supervisor_id', 'is', null)
    .is('supervisor_reminded_at', null);

  if (error) {
    // Fail soft (e.g. migration not run yet) — the next run will retry.
    return NextResponse.json({ ranAt: now.toISOString(), reminded: 0, note: error.message });
  }

  const due = ((rows ?? []) as Array<Record<string, unknown>>).filter(r => needsSupervisorReminder({
    userId:               Number(r.user_id),
    status:               String(r.status),
    stage:                (r.stage as string | null) ?? null,
    supervisorId:         (r.supervisor_id as number | null) ?? null,
    requestedAt:          (r.requested_at as string | null) ?? null,
    supervisorRemindedAt: (r.supervisor_reminded_at as string | null) ?? null,
  }, now));
  if (!due.length) return NextResponse.json({ ranAt: now.toISOString(), reminded: 0 });

  const requesterIds = [...new Set(due.map(r => Number(r.user_id)))];
  const { data: users } = await sb.from('users').select('id, name').in('id', requesterIds);
  const nameOf = new Map(((users ?? []) as { id: number; name: string }[]).map(u => [u.id, u.name]));

  let reminded = 0;
  for (const r of due) {
    // Stamp first; only the run that wins the stamp sends the reminder.
    const { data: claimed } = await sb.from('timesheet_edit_requests')
      .update({ supervisor_reminded_at: now.toISOString() })
      .eq('id', Number(r.id))
      .eq('status', 'pending')
      .eq('stage', 'supervisor')
      .is('supervisor_reminded_at', null)
      .select('id');
    if (!claimed || claimed.length === 0) continue;

    await notifyTimeEditReminder({
      recipientId:   Number(r.supervisor_id),
      requesterName: nameOf.get(Number(r.user_id)) ?? 'A teammate',
      dateLabel:     fmtDateLabel(String(r.date)),
    });
    reminded++;
  }

  return NextResponse.json({ ranAt: now.toISOString(), reminded });
});
