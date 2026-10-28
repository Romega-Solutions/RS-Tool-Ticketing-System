// Sends the time-correction emails (server side). Every call is best-effort
// and never throws. sendTimeEditEmail waits for the send to finish; routes use
// sendTimeEditEmailAfterResponse so the request never waits for email.
//
// Who gets what: the email goes To the requester, with the requester's
// recorded supervisor in CC when there is one, they are active, have an
// address, and are not the requester. These emails always go out whatever the
// requester's "approvals" email preference is (they concern a pay record); the
// in-app bell is unchanged.
//
// Whether anything is sent at all is decided by resolveTimeEditEmailPlan
// (src/lib/time-edit-email-mode.ts).

import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { publicBaseUrl } from '@/lib/app-url';
import { sendHtmlEmailAwaited } from '@/lib/n8n';
import { isValidEmailAddress, resolveTimeEditEmailPlan } from '@/lib/time-edit-email-mode';
import { renderTimeEditEmail, type TimeEditEmailKind } from '@/lib/time-edit-email-template';

type Admin = ReturnType<typeof createAdminClient>;

export type TimeEditEmailRequest = {
  id:                number;
  userId:            number;
  date:              string;
  currentClockIn:    string | null;
  currentClockOut:   string | null;
  requestedClockIn:  string | null;
  requestedClockOut: string | null;
  reason:            string;
  documentName:      string | null;
  requestedAt:       string | null;
  /** The recorded supervisor (main lead), if any. */
  supervisorId:      number | null;
};

type UserLite = { id: number; name: string; email: string | null; isActive: boolean };

/** Maps a timesheet_edit_requests row (snake_case) to the email request shape. */
export function emailRequestFromRow(row: Record<string, unknown>): TimeEditEmailRequest {
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return {
    id:                Number(row.id),
    userId:            Number(row.user_id),
    date:              String(row.date ?? ''),
    currentClockIn:    str(row.current_clock_in),
    currentClockOut:   str(row.current_clock_out),
    requestedClockIn:  str(row.requested_clock_in),
    requestedClockOut: str(row.requested_clock_out),
    reason:            String(row.reason ?? ''),
    documentName:      str(row.document_name),
    requestedAt:       str(row.requested_at),
    supervisorId:      row.supervisor_id == null ? null : Number(row.supervisor_id),
  };
}

/** To the requester; CC the supervisor only when they are a real, active, different person with an address. */
export function resolveRecipients(
  requester: Pick<UserLite, 'id' | 'email'>,
  supervisor: UserLite | null,
): { to: string | null; cc: string[] } {
  const to = requester.email?.trim() || null;
  if (!to || !isValidEmailAddress(to)) return { to: null, cc: [] };
  const ccAddr = supervisor?.email?.trim() || '';
  const ok = supervisor && supervisor.isActive && supervisor.id !== requester.id && isValidEmailAddress(ccAddr)
    && ccAddr.toLowerCase() !== to.toLowerCase();
  return { to, cc: ok ? [ccAddr] : [] };
}

async function loadUsers(admin: Admin, ids: number[]): Promise<Map<number, UserLite>> {
  const out = new Map<number, UserLite>();
  const { data, error } = await admin.from('users').select('id, name, email, is_active').in('id', ids);
  if (error) throw new Error(`users: ${error.message}`);
  for (const u of (data ?? []) as { id: number; name: string | null; email: string | null; is_active: number | boolean | null }[]) {
    out.set(u.id, { id: u.id, name: u.name ?? '', email: u.email ?? null, isActive: Boolean(u.is_active) });
  }
  return out;
}

export async function sendTimeEditEmail(opts: {
  kind:         TimeEditEmailKind;
  request:      TimeEditEmailRequest;
  /** Who decides next (for the "received" email). */
  waitingFor?:  'supervisor' | 'admin';
  deciderName?: string | null;
  note?:        string | null;
  admin?:       Admin;
}): Promise<void> {
  try {
    const plan = resolveTimeEditEmailPlan();
    if (plan.action === 'off') return;

    const { request, kind } = opts;
    const admin = opts.admin ?? createAdminClient();
    const ids = [request.userId, ...(request.supervisorId != null ? [request.supervisorId] : [])];
    const users = await loadUsers(admin, ids);
    const requester = users.get(request.userId);
    if (!requester) {
      console.error(`[time-edit-emails] requester not found for request ${request.id}`);
      return;
    }
    const supervisor = request.supervisorId != null ? users.get(request.supervisorId) ?? null : null;
    const { to, cc } = resolveRecipients(requester, supervisor);
    if (!to) {
      console.error(`[time-edit-emails] requester has no usable email address (request ${request.id})`);
      return;
    }

    const rendered = renderTimeEditEmail({
      kind,
      baseUrl:           publicBaseUrl(),
      requesterName:     requester.name,
      shiftDate:         request.date,
      currentClockIn:    request.currentClockIn,
      currentClockOut:   request.currentClockOut,
      requestedClockIn:  request.requestedClockIn,
      requestedClockOut: request.requestedClockOut,
      reason:            request.reason,
      documentName:      request.documentName,
      filedAt:           request.requestedAt,
      waitingFor:        opts.waitingFor,
      supervisorName:    supervisor?.name ?? null,
      deciderName:       opts.deciderName ?? null,
      note:              opts.note ?? null,
      supervisorCopied:  cc.length > 0,
    });

    if (plan.action !== 'send') {
      if (plan.action === 'log') {
        console.info(`[time-edit-emails] log only (${plan.reason}): ${kind} for request ${request.id}, cc ${cc.length}`);
      }
      return;
    }

    // In test mode every message goes only to the test address, with no CC.
    const result = await sendHtmlEmailAwaited(plan.testTo
      ? { to: plan.testTo, subject: `[TEST] ${rendered.subject}`, html: rendered.html, text: rendered.text }
      : { to, cc, subject: rendered.subject, html: rendered.html, text: rendered.text });
    if (!result.ok) {
      console.error(`[time-edit-emails] ${kind} for request ${request.id} not sent: ${result.error}`);
    }
  } catch (err) {
    console.error('[time-edit-emails] failed:', err instanceof Error ? err.message : err);
  }
}

/**
 * Sends the email after the response has been returned, so a request never
 * waits for the database lookup, the render or the webhook. Outside a request
 * scope (tests, scripts) there is no after(); the send then starts right away.
 */
export function sendTimeEditEmailAfterResponse(opts: Parameters<typeof sendTimeEditEmail>[0]): void {
  const run = () => sendTimeEditEmail(opts);
  try {
    after(run);
  } catch {
    void run();
  }
}
