import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';
import { MyTimeClient, type MySession, type MyRequest } from './my-time-client';

export const dynamic = 'force-dynamic';

function isoDateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default async function MyTimePage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const admin = createAdminClient();
  const since = isoDateNDaysAgo(21);

  const [{ data: tsData }, { data: reqData }] = await Promise.all([
    admin
      .from('timesheets')
      .select('id, clocked_in_at, clocked_out_at, duration_seconds, date, edited_at')
      .eq('user_id', session.id)
      .gte('date', since)
      .order('clocked_in_at', { ascending: false })
      .limit(60),
    admin
      .from('timesheet_edit_requests')
      .select('*')
      .eq('user_id', session.id)
      .order('requested_at', { ascending: false })
      .limit(30),
  ]);

  const requests: MyRequest[] = (reqData ?? []).map((r: Record<string, unknown>) => ({
    id:                r.id as number,
    timesheetId:       (r.timesheet_id as number | null) ?? null,
    date:              r.date as string,
    currentClockIn:    (r.current_clock_in as string | null) ?? null,
    currentClockOut:   (r.current_clock_out as string | null) ?? null,
    requestedClockIn:  (r.requested_clock_in as string | null) ?? null,
    requestedClockOut: (r.requested_clock_out as string | null) ?? null,
    reason:            r.reason as string,
    documentName:      (r.document_name as string | null) ?? null,
    status:            r.status as MyRequest['status'],
    requestedAt:       r.requested_at as string,
    decidedAt:         (r.decided_at as string | null) ?? null,
    decisionComment:   (r.decision_comment as string | null) ?? null,
  }));

  const pendingByTimesheet = new Set(
    requests.filter(r => r.status === 'pending' && r.timesheetId != null).map(r => r.timesheetId as number),
  );

  const sessions: MySession[] = (tsData ?? []).map((t: Record<string, unknown>) => ({
    id:              t.id as number,
    date:            t.date as string,
    clockedInAt:     t.clocked_in_at as string,
    clockedOutAt:    (t.clocked_out_at as string | null) ?? null,
    durationSeconds: (t.duration_seconds as number | null) ?? null,
    editedAt:        (t.edited_at as string | null) ?? null,
    hasPendingRequest: pendingByTimesheet.has(t.id as number),
  }));

  return <MyTimeClient sessions={sessions} requests={requests} />;
}
