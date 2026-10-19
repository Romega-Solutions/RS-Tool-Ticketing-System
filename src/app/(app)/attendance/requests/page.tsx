import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';
import { signTimesheetEditDocument } from '@/lib/storage';
import { checkDecisionRights, effectiveStage, stageLabel } from '@/lib/time-approvals';
import { hasDirectReports } from '@/lib/time-approvals-server';
import { RequestsQueueClient, type QueueRequest } from './requests-queue-client';

export const dynamic = 'force-dynamic';

const DECIDED_LIMIT = 100;

export default async function TimeEditRequestsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  // Time Approvals: admins (founder included) see every request. Everyone else
  // sees the requests where they are the supervisor (main lead), plus the ones
  // they filed themselves. Who can act on what is decided per request by
  // checkDecisionRights, the same check the API enforces.
  const isAdmin = session.role === 'admin';
  const admin = createAdminClient();

  // Filter in the query, then limit, so nobody's queue is cut short by other
  // people's requests. Open requests are never limited.
  const ownScope = `supervisor_id.eq.${session.id},user_id.eq.${session.id}`;
  let pendingQ = admin.from('timesheet_edit_requests').select('*').eq('status', 'pending');
  let decidedQ = admin.from('timesheet_edit_requests').select('*').neq('status', 'pending');
  if (!isAdmin) {
    pendingQ = pendingQ.or(ownScope);
    decidedQ = decidedQ.or(ownScope);
  }

  const [pendingRes, decidedRes, leadsSomeone] = await Promise.all([
    pendingQ.order('requested_at', { ascending: true }),
    decidedQ.order('requested_at', { ascending: false }).limit(DECIDED_LIMIT),
    isAdmin ? Promise.resolve(true) : hasDirectReports(session.id, admin),
  ]);

  const rows = [...(pendingRes.data ?? []), ...(decidedRes.data ?? [])] as Record<string, unknown>[];

  // Resolve requester, supervisor and decider names in one pass.
  const userIds = [...new Set(rows.flatMap(r =>
    [r.user_id, r.decided_by, r.supervisor_id] as (number | null)[]).filter((v): v is number => typeof v === 'number'))];
  const nameOf = new Map<number, string>();
  if (userIds.length) {
    const { data: us } = await admin.from('users').select('id, name').in('id', userIds);
    for (const u of (us ?? []) as { id: number; name: string }[]) nameOf.set(u.id, u.name);
  }

  const canDecide = isAdmin || leadsSomeone || rows.some(r => r.supervisor_id === session.id && r.user_id !== session.id);

  const requests: QueueRequest[] = await Promise.all(rows.map(async (r) => {
    const docPath = (r.document_path as string | null) ?? null;
    const documentUrl = docPath ? await signTimesheetEditDocument(docPath) : null;
    const state = {
      userId:       r.user_id as number,
      status:       r.status as string,
      stage:        (r.stage as string | null) ?? null,
      supervisorId: (r.supervisor_id as number | null) ?? null,
    };
    const rights = checkDecisionRights(state, { id: session.id, role: session.role });
    const supervisorId = state.supervisorId;
    return {
      id:                  r.id as number,
      requesterName:       nameOf.get(r.user_id as number) ?? 'Unknown',
      isOwn:               r.user_id === session.id,
      date:                r.date as string,
      currentClockIn:      (r.current_clock_in as string | null) ?? null,
      currentClockOut:     (r.current_clock_out as string | null) ?? null,
      requestedClockIn:    (r.requested_clock_in as string | null) ?? null,
      requestedClockOut:   (r.requested_clock_out as string | null) ?? null,
      reason:              r.reason as string,
      documentName:        (r.document_name as string | null) ?? null,
      documentUrl,
      status:              r.status as QueueRequest['status'],
      stage:               effectiveStage(state),
      stageLabel:          stageLabel(state),
      actAs:               rights.ok ? rights.step : null,
      requestedAt:         r.requested_at as string,
      supervisorName:      supervisorId != null ? (nameOf.get(supervisorId) ?? null) : null,
      supervisorDecision:  (r.supervisor_decision as QueueRequest['supervisorDecision']) ?? null,
      supervisorNote:      (r.supervisor_note as string | null) ?? null,
      supervisorDecidedAt: (r.supervisor_decided_at as string | null) ?? null,
      decidedAt:           (r.decided_at as string | null) ?? null,
      decisionComment:     (r.decision_comment as string | null) ?? null,
      decidedByName:       r.decided_by != null ? (nameOf.get(r.decided_by as number) ?? null) : null,
    };
  }));

  return <RequestsQueueClient requests={requests} canDecide={canDecide} isAdmin={isAdmin} />;
}
