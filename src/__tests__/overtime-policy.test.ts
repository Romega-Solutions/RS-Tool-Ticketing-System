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

// Overtime is now budget-based: a user's weekly ALLOWANCE = the 15h base cap
// plus any admin-approved overtime granted this week. Approving "+2h" raises the
// allowance to 17h (it does NOT merely open a time window). Enforcement is a hard
// ceiling at the allowance; the 16h single-session safety ceiling still applies.
const NOW = new Date('2026-06-03T12:00:00.000Z'); // a Wednesday
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000).toISOString();
const H = 3600;
const CAP = WEEKLY_CAP_SECONDS; // 15h — the base weekly allowance
const PLUS2 = CAP + 2 * H;      // 17h — allowance after a +2h grant

describe('planEnforcement — close-on-read decision + write payload', () => {
  it('does not close a session within the base allowance', () => {
    const r = planEnforcement({ clockedInAt: ago(2 * H), weekSecondsBefore: 5 * H, allowanceSeconds: CAP, now: NOW });
    expect(r).toEqual({ close: false, reason: 'within limits' });
  });

  it('closes an over-allowance session and reports the overtime slice (everything beyond 15h)', () => {
    // 14h completed + 2h running = 16h → 1h beyond the 15h base.
    const r = planEnforcement({ clockedInAt: ago(2 * H), weekSecondsBefore: 14 * H, allowanceSeconds: CAP, now: NOW });
    expect(r).toMatchObject({ close: true, durationSeconds: 2 * H, isOvertime: true, overtimeSeconds: 1 * H, reason: 'weekly allowance' });
  });

  it('closes exactly at a 15h allowance with no overtime slice', () => {
    const r = planEnforcement({ clockedInAt: ago(1 * H), weekSecondsBefore: 14 * H, allowanceSeconds: CAP, now: NOW });
    expect(r).toMatchObject({ close: true, durationSeconds: 1 * H, isOvertime: false, overtimeSeconds: null, reason: 'weekly allowance' });
  });

  it('GRANT RAISES THE CEILING: a +2h grant keeps a 16h week running (was cut at 15h before)', () => {
    // 14h completed + 2h running = 16h, allowance 17h → still within limits.
    const r = planEnforcement({ clockedInAt: ago(2 * H), weekSecondsBefore: 14 * H, allowanceSeconds: PLUS2, now: NOW });
    expect(r).toEqual({ close: false, reason: 'within limits' });
  });

  it('closes at the RAISED ceiling; the whole session counts as overtime once past 15h (payroll)', () => {
    // allowance 17h; 16h done + 2h running = 18h ≥ 17h → close. The week was
    // already past 15h, so the entire 2h slice of THIS session is overtime.
    const r = planEnforcement({ clockedInAt: ago(2 * H), weekSecondsBefore: 16 * H, allowanceSeconds: PLUS2, now: NOW });
    expect(r).toMatchObject({ close: true, durationSeconds: 2 * H, isOvertime: true, overtimeSeconds: 2 * H, reason: 'weekly allowance' });
  });

  it('closes any session past the 16h safety ceiling regardless of allowance', () => {
    const r = planEnforcement({ clockedInAt: ago(SAFETY_CEILING_SECONDS), weekSecondsBefore: 0, allowanceSeconds: PLUS2, now: NOW });
    expect(r).toMatchObject({ close: true, reason: 'safety ceiling' });
  });
});

describe('decideAutoClockOut — allowance-based weekly ceiling', () => {
  it('does NOT cut a long session still under the allowance (no per-session/day cap)', () => {
    const r = decideAutoClockOut({ clockedInAt: ago(5 * H), weekSecondsBefore: 0, allowanceSeconds: CAP, now: NOW });
    expect(r).toEqual({ action: 'skip', reason: 'within limits' });
  });

  it('still cuts at the 16h safety ceiling regardless of week total', () => {
    const r = decideAutoClockOut({ clockedInAt: ago(SAFETY_CEILING_SECONDS), weekSecondsBefore: 0, allowanceSeconds: CAP, now: NOW });
    expect(r).toEqual({ action: 'close', elapsedSec: SAFETY_CEILING_SECONDS, reason: 'safety ceiling' });
  });

  it('closes when completed + elapsed crosses the base 15h allowance', () => {
    const r = decideAutoClockOut({ clockedInAt: ago(1 * H), weekSecondsBefore: 14 * H, allowanceSeconds: CAP, now: NOW });
    expect(r.action).toBe('close');
    if (r.action === 'close') expect(r.reason).toBe('weekly allowance');
  });

  it('skips when comfortably under the allowance', () => {
    const r = decideAutoClockOut({ clockedInAt: ago(1 * H), weekSecondsBefore: 5 * H, allowanceSeconds: CAP, now: NOW });
    expect(r).toEqual({ action: 'skip', reason: 'within limits' });
  });

  it('a +2h grant lets an at-15h session keep running up to the 17h ceiling', () => {
    const r = decideAutoClockOut({ clockedInAt: ago(1 * H), weekSecondsBefore: 15 * H, allowanceSeconds: PLUS2, now: NOW });
    expect(r).toEqual({ action: 'skip', reason: 'within limits' });
  });

  it('closes once the raised 17h ceiling is reached', () => {
    const r = decideAutoClockOut({ clockedInAt: ago(2 * H), weekSecondsBefore: 15 * H, allowanceSeconds: PLUS2, now: NOW });
    expect(r.action).toBe('close');
    if (r.action === 'close') expect(r.reason).toBe('weekly allowance');
  });
});

describe('decideAutoClockOut — no role exemption (everyone capped at their allowance)', () => {
  it('closes an over-allowance session for any user', () => {
    const r = decideAutoClockOut({ clockedInAt: ago(4 * H), weekSecondsBefore: 20 * H, allowanceSeconds: CAP, now: NOW });
    expect(r.action).toBe('close');
    if (r.action === 'close') expect(r.reason).toBe('weekly allowance');
  });
});

describe('decideAutoClockOut — invalid input', () => {
  it('skips an unparseable clocked_in_at', () => {
    const r = decideAutoClockOut({ clockedInAt: 'nope', weekSecondsBefore: 0, allowanceSeconds: CAP, now: NOW });
    expect(r).toEqual({ action: 'skip', reason: 'invalid clocked_in_at' });
  });
});

describe('decideClockInAllowed', () => {
  it('blocks a contractor who already hit the 15h base allowance', () => {
    const r = decideClockInAllowed({ weekSecondsBefore: CAP, allowanceSeconds: CAP });
    expect(r).toEqual({ allowed: false, reason: 'weekly allowance reached' });
  });

  it('GRANT RAISES THE CEILING: a +2h grant lets a blocked contractor clock in again at 15h', () => {
    const r = decideClockInAllowed({ weekSecondsBefore: CAP, allowanceSeconds: PLUS2 });
    expect(r).toEqual({ allowed: true });
  });

  it('blocks again once the raised 17h ceiling is reached', () => {
    const r = decideClockInAllowed({ weekSecondsBefore: PLUS2, allowanceSeconds: PLUS2 });
    expect(r).toEqual({ allowed: false, reason: 'weekly allowance reached' });
  });

  it('allows a contractor under the allowance', () => {
    const r = decideClockInAllowed({ weekSecondsBefore: 14 * H, allowanceSeconds: CAP });
    expect(r).toEqual({ allowed: true });
  });
});

describe('isClockInCapLocked — UI mirror of the clock-in gate', () => {
  it('locks a user exactly at the 15h base allowance', () => {
    expect(isClockInCapLocked({ weekSecondsBefore: CAP, allowanceSeconds: CAP })).toBe(true);
  });

  it('locks a user over the allowance', () => {
    expect(isClockInCapLocked({ weekSecondsBefore: CAP + 5 * H, allowanceSeconds: CAP })).toBe(true);
  });

  it('unlocks once a grant raises the allowance above their used time', () => {
    expect(isClockInCapLocked({ weekSecondsBefore: CAP, allowanceSeconds: PLUS2 })).toBe(false);
  });

  it('re-locks at the raised ceiling', () => {
    expect(isClockInCapLocked({ weekSecondsBefore: PLUS2, allowanceSeconds: PLUS2 })).toBe(true);
  });

  it('does not lock a user still under the allowance', () => {
    expect(isClockInCapLocked({ weekSecondsBefore: 14 * H, allowanceSeconds: CAP })).toBe(false);
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

describe('planEnforcement — per-user base (approved hours)', () => {
  it('computes the OT slice against baseSeconds, not the flat 15h', () => {
    // 20h approved base, +0 grant ⇒ allowance 20h. 19h done + 2h run = 21h ≥ 20h
    // → close; overtime is the slice beyond the 20h base = 1h (not 6h vs 15h).
    const r = planEnforcement({ clockedInAt: ago(2 * H), weekSecondsBefore: 19 * H, allowanceSeconds: 20 * H, baseSeconds: 20 * H, now: NOW });
    expect(r).toMatchObject({ close: true, isOvertime: true, overtimeSeconds: 1 * H });
  });
  it('defaults the base to 15h when baseSeconds is omitted (back-compat)', () => {
    const r = planEnforcement({ clockedInAt: ago(2 * H), weekSecondsBefore: 14 * H, allowanceSeconds: CAP, now: NOW });
    expect(r).toMatchObject({ close: true, isOvertime: true, overtimeSeconds: 1 * H });
  });
});
