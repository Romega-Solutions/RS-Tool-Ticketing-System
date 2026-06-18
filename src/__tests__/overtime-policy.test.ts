import { describe, it, expect } from 'vitest';
import {
  decideAutoClockOut,
  decideClockInAllowed,
  isClockInCapLocked,
  planEnforcement,
  weekStartMonday,
} from '@/lib/overtime-policy';
import {
  WEEKLY_CAP_SECONDS,
  SAFETY_CEILING_SECONDS,
} from '@/lib/utils';

const NOW = new Date('2026-06-03T12:00:00.000Z'); // a Wednesday
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000).toISOString();
const future = (seconds: number) => new Date(NOW.getTime() + seconds * 1000).toISOString();
const H = 3600;

describe('planEnforcement — close-on-read decision + write payload', () => {
  it('does not close a session within limits', () => {
    const r = planEnforcement({ role: 'ic', clockedInAt: ago(2 * H), weekSecondsBefore: 5 * H, approvedUntil: null, now: NOW });
    expect(r).toEqual({ close: false, reason: 'within limits' });
  });

  it('closes an over-cap session and reports the overtime slice', () => {
    // 14h completed + 2h running = 16h → 1h beyond the 15h cap.
    const r = planEnforcement({ role: 'ic', clockedInAt: ago(2 * H), weekSecondsBefore: 14 * H, approvedUntil: null, now: NOW });
    expect(r).toMatchObject({ close: true, durationSeconds: 2 * H, isOvertime: true, overtimeSeconds: 1 * H, reason: 'weekly cap' });
  });

  it('closes exactly at the cap with no overtime (overtimeSeconds null)', () => {
    // 14h completed + 1h running = 15h exactly → close, but no overtime slice.
    const r = planEnforcement({ role: 'ic', clockedInAt: ago(1 * H), weekSecondsBefore: 14 * H, approvedUntil: null, now: NOW });
    expect(r).toMatchObject({ close: true, durationSeconds: 1 * H, isOvertime: false, overtimeSeconds: null, reason: 'weekly cap' });
  });

  it('closes any session past the 16h safety ceiling, even an admin', () => {
    const r = planEnforcement({ role: 'admin', clockedInAt: ago(SAFETY_CEILING_SECONDS), weekSecondsBefore: 0, approvedUntil: null, now: NOW });
    expect(r).toMatchObject({ close: true, reason: 'safety ceiling' });
  });

  it('closes an over-cap admin now that admins are capped like everyone', () => {
    const r = planEnforcement({ role: 'admin', clockedInAt: ago(4 * H), weekSecondsBefore: 20 * H, approvedUntil: null, now: NOW });
    expect(r).toMatchObject({ close: true, isOvertime: true, reason: 'weekly cap' });
  });

  it('does not close a non-admin holding active approval', () => {
    const r = planEnforcement({ role: 'ic', clockedInAt: ago(4 * H), weekSecondsBefore: 20 * H, approvedUntil: future(3600), now: NOW });
    expect(r).toEqual({ close: false, reason: 'approved overtime' });
  });
});

describe('decideAutoClockOut — no per-session/day cap', () => {
  it('does NOT cut a long session that is still under the weekly cap', () => {
    // 5h continuous session, only 5h this week → fine. (Old 3h cut is gone.)
    const r = decideAutoClockOut({ role: 'ic', clockedInAt: ago(5 * H), weekSecondsBefore: 0, approvedUntil: null, now: NOW });
    expect(r).toEqual({ action: 'skip', reason: 'within limits' });
  });

  it('still cuts at the 16h safety ceiling regardless of week total', () => {
    const r = decideAutoClockOut({ role: 'ic', clockedInAt: ago(SAFETY_CEILING_SECONDS), weekSecondsBefore: 0, approvedUntil: null, now: NOW });
    expect(r).toEqual({ action: 'close', elapsedSec: SAFETY_CEILING_SECONDS, reason: 'safety ceiling' });
  });
});

describe('decideAutoClockOut — no role exemption (admins capped like everyone)', () => {
  it.each(['admin', 'ceo', 'owner', 'superadmin'])('closes role=%s past the weekly cap', (role) => {
    const r = decideAutoClockOut({ role, clockedInAt: ago(4 * H), weekSecondsBefore: 20 * H, approvedUntil: null, now: NOW });
    expect(r.action).toBe('close');
    if (r.action === 'close') expect(r.reason).toBe('weekly cap');
  });

  it('closes even an admin at the 16h safety ceiling (ghost-session guard)', () => {
    const r = decideAutoClockOut({ role: 'admin', clockedInAt: ago(SAFETY_CEILING_SECONDS), weekSecondsBefore: 0, approvedUntil: null, now: NOW });
    expect(r.action).toBe('close');
    if (r.action === 'close') expect(r.reason).toBe('safety ceiling');
  });
});

describe('decideAutoClockOut — admin approval suspends the weekly cap', () => {
  it('skips an over-cap session when an approval is still active', () => {
    const r = decideAutoClockOut({ role: 'ic', clockedInAt: ago(4 * H), weekSecondsBefore: 20 * H, approvedUntil: future(3600), now: NOW });
    expect(r).toEqual({ action: 'skip', reason: 'approved overtime' });
  });

  it('ignores an expired approval and closes on the weekly cap', () => {
    const r = decideAutoClockOut({ role: 'ic', clockedInAt: ago(4 * H), weekSecondsBefore: 20 * H, approvedUntil: ago(60), now: NOW });
    expect(r.action).toBe('close');
    if (r.action === 'close') expect(r.reason).toBe('weekly cap');
  });

  it('ignores a garbage approval value and closes on the weekly cap', () => {
    const r = decideAutoClockOut({ role: 'ic', clockedInAt: ago(4 * H), weekSecondsBefore: 20 * H, approvedUntil: 'not-a-date', now: NOW });
    expect(r.action).toBe('close');
    if (r.action === 'close') expect(r.reason).toBe('weekly cap');
  });
});

describe('decideAutoClockOut — weekly 15h cap', () => {
  it('closes when completed + elapsed crosses 15h', () => {
    // 14h already done this week, 1h into a fresh session = 15h → cut.
    const r = decideAutoClockOut({ role: 'ic', clockedInAt: ago(1 * H), weekSecondsBefore: 14 * H, approvedUntil: null, now: NOW });
    expect(r.action).toBe('close');
    if (r.action === 'close') expect(r.reason).toBe('weekly cap');
  });

  it('skips when comfortably under the weekly cap', () => {
    const r = decideAutoClockOut({ role: 'ic', clockedInAt: ago(1 * H), weekSecondsBefore: 5 * H, approvedUntil: null, now: NOW });
    expect(r).toEqual({ action: 'skip', reason: 'within limits' });
  });
});

describe('decideAutoClockOut — invalid input', () => {
  it('skips an unparseable clocked_in_at', () => {
    const r = decideAutoClockOut({ role: 'ic', clockedInAt: 'nope', weekSecondsBefore: 0, approvedUntil: null, now: NOW });
    expect(r).toEqual({ action: 'skip', reason: 'invalid clocked_in_at' });
  });
});

describe('decideClockInAllowed', () => {
  it('blocks a contractor who already hit 15h this week', () => {
    const r = decideClockInAllowed({ role: 'ic', weekSecondsBefore: WEEKLY_CAP_SECONDS, approvedUntil: null, now: NOW });
    expect(r).toEqual({ allowed: false, reason: 'weekly cap reached' });
  });

  it('allows a blocked contractor who has an active approval', () => {
    const r = decideClockInAllowed({ role: 'ic', weekSecondsBefore: WEEKLY_CAP_SECONDS, approvedUntil: future(3600), now: NOW });
    expect(r).toEqual({ allowed: true });
  });

  it('blocks admins at the cap too (no role exemption)', () => {
    const r = decideClockInAllowed({ role: 'ceo', weekSecondsBefore: WEEKLY_CAP_SECONDS * 2, approvedUntil: null, now: NOW });
    expect(r).toEqual({ allowed: false, reason: 'weekly cap reached' });
  });

  it('allows an admin who holds an active approval', () => {
    const r = decideClockInAllowed({ role: 'admin', weekSecondsBefore: WEEKLY_CAP_SECONDS * 2, approvedUntil: future(3600), now: NOW });
    expect(r).toEqual({ allowed: true });
  });

  it('allows a contractor under the cap', () => {
    const r = decideClockInAllowed({ role: 'ic', weekSecondsBefore: 14 * H, approvedUntil: null, now: NOW });
    expect(r).toEqual({ allowed: true });
  });
});

describe('isClockInCapLocked — UI mirror of the clock-in gate for a clocked-out user', () => {
  it('locks a user who is exactly at the 15h cap with no request', () => {
    expect(isClockInCapLocked({ weekSecondsBefore: WEEKLY_CAP_SECONDS, requestStatus: 'none' })).toBe(true);
  });

  it('locks a user who is over the cap', () => {
    expect(isClockInCapLocked({ weekSecondsBefore: WEEKLY_CAP_SECONDS + 5 * H, requestStatus: 'none' })).toBe(true);
  });

  it('keeps locking while a request is only pending (not yet approved)', () => {
    expect(isClockInCapLocked({ weekSecondsBefore: WEEKLY_CAP_SECONDS, requestStatus: 'pending' })).toBe(true);
  });

  it('unlocks once the overtime request is approved', () => {
    expect(isClockInCapLocked({ weekSecondsBefore: WEEKLY_CAP_SECONDS * 2, requestStatus: 'approved' })).toBe(false);
  });

  it('does not lock a user still under the cap', () => {
    expect(isClockInCapLocked({ weekSecondsBefore: 14 * H, requestStatus: 'none' })).toBe(false);
  });
});

describe('weekStartMonday', () => {
  it('returns the Monday for a midweek date', () => {
    expect(weekStartMonday(new Date('2026-06-03T12:00:00'))).toBe('2026-06-01');
  });
  it('returns the same day for a Monday', () => {
    expect(weekStartMonday(new Date('2026-06-01T09:00:00'))).toBe('2026-06-01');
  });
  it('maps Sunday back to the prior Monday', () => {
    expect(weekStartMonday(new Date('2026-06-07T09:00:00'))).toBe('2026-06-01');
  });
});
