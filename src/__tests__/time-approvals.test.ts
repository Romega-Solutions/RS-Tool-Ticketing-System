import { describe, it, expect } from 'vitest';
import {
  addWorkingDays,
  checkDecisionRights,
  decisionUpdate,
  effectiveStage,
  initialStage,
  needsSupervisorReminder,
  parseDbTimestamp,
  stageLabel,
  validateDecisionNote,
  type TimeEditRequestState,
} from '@/lib/time-approvals';
import { normalizeRole } from '@/lib/rbac';

// Manila is UTC+8. Helper: a Manila wall-clock time as an instant.
const pht = (ymdhm: string) => new Date(`${ymdhm}:00+08:00`);

const REQUESTER = 65;
const LEAD = 48;
const ADMIN = 21;
const FOUNDER = 24;

const pending = (over: Partial<TimeEditRequestState> = {}): TimeEditRequestState => ({
  userId: REQUESTER, status: 'pending', stage: 'supervisor', supervisorId: LEAD, ...over,
});

describe('initialStage (skip rule)', () => {
  it('starts at the supervisor step when the main lead is a regular lead', () => {
    expect(initialStage(REQUESTER, { id: LEAD, role: 'lead', isActive: true }))
      .toEqual({ stage: 'supervisor', supervisorId: LEAD });
  });

  it('any non-admin lead counts, whatever their role label', () => {
    expect(initialStage(REQUESTER, { id: LEAD, role: 'ic', isActive: true }).stage).toBe('supervisor');
  });

  it('skips to the admin step when the supervisor is the founder', () => {
    expect(initialStage(REQUESTER, { id: FOUNDER, role: 'founder', isActive: true }))
      .toEqual({ stage: 'admin', supervisorId: FOUNDER });
    expect(initialStage(REQUESTER, { id: FOUNDER, role: 'ceo', isActive: true }).stage).toBe('admin');
  });

  it('skips to the admin step when the supervisor is an admin', () => {
    expect(initialStage(REQUESTER, { id: ADMIN, role: 'admin', isActive: true }))
      .toEqual({ stage: 'admin', supervisorId: ADMIN });
  });

  it('goes to admins when there is no usable supervisor', () => {
    expect(initialStage(FOUNDER, null)).toEqual({ stage: 'admin', supervisorId: null });
    expect(initialStage(REQUESTER, { id: LEAD, role: 'lead', isActive: false }).stage).toBe('admin');
    expect(initialStage(REQUESTER, { id: REQUESTER, role: 'lead', isActive: true }).stage).toBe('admin');
  });
});

describe('effectiveStage', () => {
  it('anything decided is done', () => {
    expect(effectiveStage(pending({ status: 'approved' }))).toBe('done');
    expect(effectiveStage(pending({ status: 'denied', stage: 'supervisor' }))).toBe('done');
  });

  it('waits on the supervisor only when one is recorded', () => {
    expect(effectiveStage(pending())).toBe('supervisor');
    expect(effectiveStage(pending({ supervisorId: null }))).toBe('admin');
  });

  it('treats rows filed before the two-step columns existed as the admin step', () => {
    expect(effectiveStage(pending({ stage: null, supervisorId: null }))).toBe('admin');
  });

  it('labels each step', () => {
    expect(stageLabel(pending())).toBe('Waiting for supervisor');
    expect(stageLabel(pending({ stage: 'admin' }))).toBe('Waiting for admin');
    expect(stageLabel(pending({ status: 'approved', stage: 'done' }))).toBe('Approved');
    expect(stageLabel(pending({ status: 'denied', stage: 'done' }))).toBe('Declined');
  });
});

describe('checkDecisionRights', () => {
  it('lets the recorded supervisor decide the supervisor step', () => {
    expect(checkDecisionRights(pending(), { id: LEAD, role: 'lead' })).toEqual({ ok: true, step: 'supervisor' });
  });

  it('does not let another lead (e.g. an "also reports to" lead) decide', () => {
    const res = checkDecisionRights(pending(), { id: 99, role: 'lead' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(403);
  });

  it('keeps the supervisor out of the admin step', () => {
    const res = checkDecisionRights(pending({ stage: 'admin' }), { id: LEAD, role: 'lead' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(409);
  });

  it('lets admins and the founder decide any open request, always as the admin step', () => {
    expect(checkDecisionRights(pending(), { id: ADMIN, role: 'admin' })).toEqual({ ok: true, step: 'admin' });
    expect(checkDecisionRights(pending({ stage: 'admin' }), { id: ADMIN, role: 'admin' })).toEqual({ ok: true, step: 'admin' });
    expect(checkDecisionRights(pending(), { id: FOUNDER, role: normalizeRole('founder') })).toEqual({ ok: true, step: 'admin' });
  });

  it('blocks self-approval, admins included', () => {
    const own = pending({ userId: ADMIN, stage: 'admin', supervisorId: FOUNDER });
    const res = checkDecisionRights(own, { id: ADMIN, role: 'admin' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(403);
    expect(checkDecisionRights(pending(), { id: REQUESTER, role: 'ic' }).ok).toBe(false);
  });

  it('a supervisor rejection is final: nobody can act on a decided request', () => {
    const rejected = pending({ status: 'denied', stage: 'done' });
    for (const actor of [{ id: LEAD, role: 'lead' as const }, { id: ADMIN, role: 'admin' as const }]) {
      const res = checkDecisionRights(rejected, actor);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.status).toBe(409);
    }
  });
});

describe('validateDecisionNote', () => {
  it('requires a note to approve and a reason to reject', () => {
    expect(validateDecisionNote('approve', '').ok).toBe(false);
    expect(validateDecisionNote('approve', '   ').ok).toBe(false);
    expect(validateDecisionNote('approve', undefined).ok).toBe(false);
    expect(validateDecisionNote('deny', '').ok).toBe(false);
    expect(validateDecisionNote('deny', 42).ok).toBe(false);
  });

  it('accepts a one-word note and trims it', () => {
    expect(validateDecisionNote('approve', '  Confirmed ')).toEqual({ ok: true, note: 'Confirmed' });
  });

  it('caps the note length', () => {
    expect(validateDecisionNote('deny', 'x'.repeat(1001)).ok).toBe(false);
    expect(validateDecisionNote('deny', 'x'.repeat(1000)).ok).toBe(true);
  });
});

describe('decisionUpdate', () => {
  const now = '2026-10-20T01:00:00.000Z';

  it('supervisor approval hands over to the admin step without touching the timesheet', () => {
    const d = decisionUpdate('supervisor', 'approve', LEAD, 'ok', now);
    expect(d.applyTimesheet).toBe(false);
    expect(d.final).toBe(false);
    expect(d.update).toEqual({ stage: 'admin', supervisor_decision: 'approved', supervisor_note: 'ok', supervisor_decided_at: now });
    expect(d.update).not.toHaveProperty('status');
  });

  it('supervisor rejection is final and closes the request', () => {
    const d = decisionUpdate('supervisor', 'deny', LEAD, 'wrong day', now);
    expect(d.applyTimesheet).toBe(false);
    expect(d.final).toBe(true);
    expect(d.update).toMatchObject({
      status: 'denied', stage: 'done', supervisor_decision: 'denied', supervisor_note: 'wrong day',
      decided_by: LEAD, decision_comment: 'wrong day',
    });
  });

  it('only an admin approval changes the timesheet', () => {
    const ok = decisionUpdate('admin', 'approve', ADMIN, 'fine', now);
    expect(ok.applyTimesheet).toBe(true);
    expect(ok.update).toMatchObject({ status: 'approved', stage: 'done', decided_by: ADMIN, decision_comment: 'fine' });
    const no = decisionUpdate('admin', 'deny', ADMIN, 'no proof', now);
    expect(no.applyTimesheet).toBe(false);
    expect(no.update).toMatchObject({ status: 'denied', stage: 'done', decision_comment: 'no proof' });
  });
});

describe('working-day reminder math (Mon–Fri, Manila)', () => {
  it('adds working days within a week', () => {
    expect(addWorkingDays(pht('2026-10-19T10:00'), 2)).toEqual(pht('2026-10-21T10:00')); // Mon → Wed
  });

  it('skips the weekend', () => {
    expect(addWorkingDays(pht('2026-10-16T15:00'), 2)).toEqual(pht('2026-10-20T15:00')); // Fri → Tue
    expect(addWorkingDays(pht('2026-10-15T09:00'), 2)).toEqual(pht('2026-10-19T09:00')); // Thu → Mon
  });

  it('starts a weekend filing at Monday 12:00 AM', () => {
    expect(addWorkingDays(pht('2026-10-17T11:00'), 2)).toEqual(pht('2026-10-21T00:00')); // Sat → Wed
    expect(addWorkingDays(pht('2026-10-18T23:30'), 2)).toEqual(pht('2026-10-21T00:00')); // Sun → Wed
  });

  it('uses Manila days, not UTC days', () => {
    // Fri 7:00 AM Manila is still Thursday in UTC.
    expect(addWorkingDays(pht('2026-10-16T07:00'), 2)).toEqual(pht('2026-10-20T07:00'));
  });

  it('parses Postgres text timestamps', () => {
    expect(parseDbTimestamp('2026-10-16 15:46:18.387301+00')?.toISOString()).toBe('2026-10-16T15:46:18.387Z');
    expect(parseDbTimestamp('2026-10-16T15:46:18.000Z')?.toISOString()).toBe('2026-10-16T15:46:18.000Z');
    expect(parseDbTimestamp('not a date')).toBeNull();
    expect(parseDbTimestamp(null)).toBeNull();
  });

  const waiting = (requestedAt: string, over: Partial<TimeEditRequestState & { supervisorRemindedAt: string | null }> = {}) => ({
    ...pending(), requestedAt, supervisorRemindedAt: null, ...over,
  });

  it('reminds once 2 working days have passed, not before', () => {
    const filed = pht('2026-10-16T15:00').toISOString(); // Fri
    expect(needsSupervisorReminder(waiting(filed), pht('2026-10-19T09:30'))).toBe(false); // Mon
    expect(needsSupervisorReminder(waiting(filed), pht('2026-10-20T09:30'))).toBe(false); // Tue morning
    expect(needsSupervisorReminder(waiting(filed), pht('2026-10-20T15:00'))).toBe(true);  // Tue 3 PM
    expect(needsSupervisorReminder(waiting(filed), pht('2026-10-21T09:30'))).toBe(true);  // Wed
  });

  it('sends only one reminder', () => {
    const filed = pht('2026-10-12T09:00').toISOString();
    expect(needsSupervisorReminder(waiting(filed, { supervisorRemindedAt: '2026-10-14T01:30:00.000Z' }), pht('2026-10-20T09:30'))).toBe(false);
  });

  it('never reminds once the request has left the supervisor step', () => {
    const filed = pht('2026-10-12T09:00').toISOString();
    const now = pht('2026-10-20T09:30');
    expect(needsSupervisorReminder(waiting(filed, { stage: 'admin' }), now)).toBe(false);
    expect(needsSupervisorReminder(waiting(filed, { status: 'denied', stage: 'done' }), now)).toBe(false);
    expect(needsSupervisorReminder(waiting(filed, { supervisorId: null }), now)).toBe(false);
  });

  it('handles the stored Postgres timestamp format (the pending request moved by the migration)', () => {
    // Filed Fri Oct 16, 11:46 PM Manila → due Tue Oct 20, 11:46 PM Manila.
    const row = waiting('2026-10-16 15:46:18.387301+00');
    expect(needsSupervisorReminder(row, pht('2026-10-20T09:30'))).toBe(false);
    expect(needsSupervisorReminder(row, pht('2026-10-21T09:30'))).toBe(true);
  });
});
