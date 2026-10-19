// Two-step approval for time-correction requests (pure, no I/O).
//
// Flow:
//   1. The requester files a correction. It waits on their main lead (the
//      supervisor, from user_reporting; founder by default).
//   2. The supervisor approves or rejects. A rejection is final. An approval
//      moves the request to the admin step.
//   3. An admin approves or rejects. Only an admin approval changes the
//      timesheet.
//
// Rules:
//   - When the supervisor is an admin or the founder (both normalize to the
//     admin role), or there is no usable supervisor, the request starts at the
//     admin step.
//   - Admins (founder included) may decide any open request, at either step.
//     An admin decision is always the final, admin-step decision.
//   - Nobody decides their own request, admins included.
//   - Every decision needs a note: a reason to reject, a short note to approve.
//   - A supervisor who hasn't acted after 2 working days (Mon–Fri, Manila
//     time) gets one reminder.

import { normalizeRole, type AppRole } from '@/lib/rbac';

export type TimeEditStage = 'supervisor' | 'admin' | 'done';
export type TimeEditStatus = 'pending' | 'approved' | 'denied' | 'cancelled';
export type TimeEditAction = 'approve' | 'deny';

export type TimeEditRequestState = {
  userId:       number;
  status:       string;
  stage:        string | null;
  supervisorId: number | null;
};

export type Approver = { id: number; role: AppRole };

export const NOTE_MAX_LENGTH = 1000;
export const REMINDER_WORKING_DAYS = 2;

/**
 * Where a newly filed request starts. `supervisor` is the requester's main
 * lead (null when there is none, e.g. the requester is the founder).
 */
export function initialStage(
  requesterId: number,
  supervisor: { id: number; role: string | null; isActive: boolean } | null,
): { stage: Exclude<TimeEditStage, 'done'>; supervisorId: number | null } {
  if (!supervisor || supervisor.id === requesterId) {
    return { stage: 'admin', supervisorId: supervisor?.id ?? null };
  }
  if (!supervisor.isActive || normalizeRole(supervisor.role) === 'admin') {
    return { stage: 'admin', supervisorId: supervisor.id };
  }
  return { stage: 'supervisor', supervisorId: supervisor.id };
}

/**
 * The step a stored request is really at. Status wins: anything not pending is
 * done. A pending request only waits on a supervisor when one is recorded;
 * otherwise (including rows filed before the two-step columns existed) it is
 * at the admin step.
 */
export function effectiveStage(req: Pick<TimeEditRequestState, 'status' | 'stage' | 'supervisorId'>): TimeEditStage {
  if (req.status !== 'pending') return 'done';
  if (req.stage === 'supervisor' && req.supervisorId != null) return 'supervisor';
  return 'admin';
}

export type DecisionCheck =
  | { ok: true; step: 'supervisor' | 'admin' }
  | { ok: false; status: 403 | 409; error: string };

/**
 * May `actor` decide this request right now, and as which step? Admins always
 * decide as the admin step; the recorded supervisor decides only while the
 * request waits on them.
 */
export function checkDecisionRights(req: TimeEditRequestState, actor: Approver): DecisionCheck {
  const stage = effectiveStage(req);
  if (stage === 'done') return { ok: false, status: 409, error: 'This request has already been decided.' };
  if (actor.id === req.userId) {
    return { ok: false, status: 403, error: 'You can’t approve or reject your own request.' };
  }
  if (actor.role === 'admin') return { ok: true, step: 'admin' };
  if (stage === 'supervisor' && req.supervisorId === actor.id) return { ok: true, step: 'supervisor' };
  if (stage === 'admin' && req.supervisorId === actor.id) {
    return { ok: false, status: 409, error: 'This request is already with an admin.' };
  }
  return { ok: false, status: 403, error: 'Only the requester’s supervisor or an admin can decide this request.' };
}

/** Validates the note every decision needs. Returns the trimmed note or an error. */
export function validateDecisionNote(action: TimeEditAction, raw: unknown): { ok: true; note: string } | { ok: false; error: string } {
  const note = typeof raw === 'string' ? raw.trim() : '';
  if (!note) {
    return {
      ok: false,
      error: action === 'deny'
        ? 'A reason is required to reject a request.'
        : 'A short note is required to approve a request (one word is fine).',
    };
  }
  if (note.length > NOTE_MAX_LENGTH) {
    return { ok: false, error: `Keep the note under ${NOTE_MAX_LENGTH} characters.` };
  }
  return { ok: true, note };
}

/**
 * The column changes for a decision. `applyTimesheet` is true only for an
 * admin approval, the one outcome that edits the timesheet.
 */
export function decisionUpdate(
  step: 'supervisor' | 'admin',
  action: TimeEditAction,
  actorId: number,
  note: string,
  nowIso: string,
): { update: Record<string, string | number | null>; applyTimesheet: boolean; final: boolean } {
  if (step === 'supervisor') {
    if (action === 'approve') {
      return {
        update: {
          stage: 'admin',
          supervisor_decision: 'approved',
          supervisor_note: note,
          supervisor_decided_at: nowIso,
        },
        applyTimesheet: false,
        final: false,
      };
    }
    // A supervisor rejection is final. decided_* records who closed it so
    // older views (and the requester's My Time) keep showing the reason.
    return {
      update: {
        status: 'denied',
        stage: 'done',
        supervisor_decision: 'denied',
        supervisor_note: note,
        supervisor_decided_at: nowIso,
        decided_by: actorId,
        decided_at: nowIso,
        decision_comment: note,
      },
      applyTimesheet: false,
      final: true,
    };
  }
  return {
    update: {
      status: action === 'approve' ? 'approved' : 'denied',
      stage: 'done',
      decided_by: actorId,
      decided_at: nowIso,
      decision_comment: note,
    },
    applyTimesheet: action === 'approve',
    final: true,
  };
}

// ── Working-day reminder math (Asia/Manila, Mon–Fri) ─────────────────────────

const PHT_OFFSET_MS = 8 * 3600 * 1000;
const DAY_MS = 86_400_000;

/**
 * Parses a stored timestamp. Postgres CURRENT_TIMESTAMP defaults are stored as
 * text like "2026-10-16 15:46:18.387301+00", which not every JS engine parses,
 * so normalize it to ISO first. Returns null when unparseable.
 */
export function parseDbTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  let s = String(value).trim();
  s = s.replace(/^(\d{4}-\d{2}-\d{2}) (\d)/, '$1T$2');
  s = s.replace(/([+-]\d{2})$/, '$1:00');
  s = s.replace(/(\.\d{3})\d+/, '$1');
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function isWeekendPht(ms: number): boolean {
  const day = new Date(ms + PHT_OFFSET_MS).getUTCDay();
  return day === 0 || day === 6;
}

function startOfPhtDay(ms: number): number {
  const local = ms + PHT_OFFSET_MS;
  return local - (((local % DAY_MS) + DAY_MS) % DAY_MS) - PHT_OFFSET_MS;
}

/**
 * The instant `workingDays` full working days after `from`. Time spent on a
 * Saturday or Sunday doesn't count: a request filed on a weekend starts its
 * clock at Monday 12:00 AM (Manila).
 *   Mon 10:00 + 2 → Wed 10:00
 *   Fri 15:00 + 2 → Tue 15:00
 *   Sat 11:00 + 2 → Wed 00:00
 */
export function addWorkingDays(from: Date, workingDays: number): Date {
  let ms = from.getTime();
  while (isWeekendPht(ms)) ms = startOfPhtDay(ms) + DAY_MS;
  let left = workingDays;
  while (left > 0) {
    ms += DAY_MS;
    if (!isWeekendPht(ms)) left--;
  }
  return new Date(ms);
}

/** Does this request need its one supervisor reminder now? */
export function needsSupervisorReminder(
  req: TimeEditRequestState & { requestedAt: string | null; supervisorRemindedAt: string | null },
  now: Date,
  workingDays = REMINDER_WORKING_DAYS,
): boolean {
  if (effectiveStage(req) !== 'supervisor') return false;
  if (req.supervisorRemindedAt) return false;
  const filed = parseDbTimestamp(req.requestedAt);
  if (!filed) return false;
  return now.getTime() >= addWorkingDays(filed, workingDays).getTime();
}

/** Short label for where a request is, for the requester and approvers. */
export function stageLabel(req: Pick<TimeEditRequestState, 'status' | 'stage' | 'supervisorId'>): string {
  const stage = effectiveStage(req);
  if (stage === 'supervisor') return 'Waiting for supervisor';
  if (stage === 'admin') return 'Waiting for admin';
  if (req.status === 'approved') return 'Approved';
  if (req.status === 'denied') return 'Declined';
  return 'Cancelled';
}
