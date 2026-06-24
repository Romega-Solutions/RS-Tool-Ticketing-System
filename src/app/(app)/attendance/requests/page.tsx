import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';
import { canAccessReports } from '@/lib/rbac';
import { signTimesheetEditDocument } from '@/lib/storage';
import { RequestsQueueClient, type QueueRequest } from './requests-queue-client';

export const dynamic = 'force-dynamic';

export default async function TimeEditRequestsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  // Open to all (Time Requests is a Workspace tool). Only leads/admins can act
  // on requests; everyone else just tracks the requests they filed themselves.
  const canDecide = canAccessReports(session.role);

  const admin = createAdminClient();

  const { data: reqRows } = await admin
    .from('timesheet_edit_requests')
    .select('*')
    .order('requested_at', { ascending: false })
    .limit(150);

  const rows = reqRows ?? [];

  // Resolve requester + decider names (and teams for lead scoping) in one pass.
  const userIds = [...new Set(rows.flatMap((r: Record<string, unknown>) =>
    [r.user_id as number, r.decided_by as number | null]).filter((v): v is number => typeof v === 'number'))];
  const userMap = new Map<number, { name: string; team: string | null }>();
  if (userIds.length) {
    const { data: us } = await admin.from('users').select('id, name, team').in('id', userIds);
    for (const u of (us ?? []) as { id: number; name: string; team: string | null }[]) {
      userMap.set(u.id, { name: u.name, team: u.team });
    }
  }

  const isAdmin = session.role === 'admin';

  // Admins see everything; leads see their own team's requests; everyone else
  // (IC / intern) sees only the requests they filed themselves.
  const visible = rows.filter((r: Record<string, unknown>) => {
    if (!canDecide) return (r.user_id as number) === session.id;
    if (isAdmin) return true;
    const requester = userMap.get(r.user_id as number);
    return (requester?.team ?? '') === (session.team ?? '');
  });

  const requests: QueueRequest[] = await Promise.all(visible.map(async (r: Record<string, unknown>) => {
    const docPath = (r.document_path as string | null) ?? null;
    const documentUrl = docPath ? await signTimesheetEditDocument(docPath) : null;
    return {
      id:                r.id as number,
      requesterName:     userMap.get(r.user_id as number)?.name ?? 'Unknown',
      date:              r.date as string,
      currentClockIn:    (r.current_clock_in as string | null) ?? null,
      currentClockOut:   (r.current_clock_out as string | null) ?? null,
      requestedClockIn:  (r.requested_clock_in as string | null) ?? null,
      requestedClockOut: (r.requested_clock_out as string | null) ?? null,
      reason:            r.reason as string,
      documentName:      (r.document_name as string | null) ?? null,
      documentUrl,
      status:            r.status as QueueRequest['status'],
      requestedAt:       r.requested_at as string,
      decidedAt:         (r.decided_at as string | null) ?? null,
      decisionComment:   (r.decision_comment as string | null) ?? null,
      decidedByName:     r.decided_by != null ? (userMap.get(r.decided_by as number)?.name ?? null) : null,
    };
  }));

  return <RequestsQueueClient requests={requests} canDecide={canDecide} />;
}
