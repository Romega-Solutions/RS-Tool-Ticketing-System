import { describe, it, expect } from 'vitest';
import {
  WEEKLY_CAP_SECONDS,
  isOvertime,
  computeOvertime,
  weeklyBudget,
} from '@/lib/utils';

const H = 3600;

describe('isOvertime (week-to-date total vs 15h cap)', () => {
  it('is false below the 15h weekly cap', () => {
    expect(isOvertime(0)).toBe(false);
    expect(isOvertime(WEEKLY_CAP_SECONDS - 1)).toBe(false);
  });

  it('is false exactly at 15h (the cap itself is not overtime)', () => {
    expect(isOvertime(WEEKLY_CAP_SECONDS)).toBe(false);
  });

  it('is true past 15h', () => {
    expect(isOvertime(WEEKLY_CAP_SECONDS + 1)).toBe(true);
    expect(isOvertime(20 * H)).toBe(true);
  });

  it('handles negative/garbage input as not overtime', () => {
    expect(isOvertime(-5)).toBe(false);
  });
});

describe('computeOvertime (slice of a session beyond 15h/week)', () => {
  it('no overtime when the week stays under 15h', () => {
    expect(computeOvertime(5 * H, 3 * H)).toEqual({ isOvertime: false, overtimeSeconds: 0 });
  });

  it('no overtime when the week lands exactly on 15h', () => {
    expect(computeOvertime(14 * H, 1 * H)).toEqual({ isOvertime: false, overtimeSeconds: 0 });
  });

  it('counts only the slice that crosses 15h', () => {
    // 14h done + a 2h session = 16h total → 1h of it is overtime.
    expect(computeOvertime(14 * H, 2 * H)).toEqual({ isOvertime: true, overtimeSeconds: 1 * H });
  });

  it('counts the whole session when the week was already at/over 15h', () => {
    expect(computeOvertime(15 * H, 2 * H)).toEqual({ isOvertime: true, overtimeSeconds: 2 * H });
    expect(computeOvertime(20 * H, 1 * H)).toEqual({ isOvertime: true, overtimeSeconds: 1 * H });
  });

  it('floors garbage/negative durations at zero overtime', () => {
    expect(computeOvertime(0, -100)).toEqual({ isOvertime: false, overtimeSeconds: 0 });
  });
});

describe('weeklyBudget (personal view of the 15h weekly cap)', () => {
  it('reports a full budget when nothing has been worked', () => {
    expect(weeklyBudget(0, 0)).toEqual({
      usedSeconds: 0,
      remainingSeconds: WEEKLY_CAP_SECONDS,
      capSeconds: WEEKLY_CAP_SECONDS,
      percentUsed: 0,
      isOvertime: false,
    });
  });

  it('adds the live session elapsed to completed seconds for the used total', () => {
    // 9h already done + a 2h live session = 11h used, 4h left.
    expect(weeklyBudget(9 * H, 2 * H)).toMatchObject({
      usedSeconds: 11 * H,
      remainingSeconds: 4 * H,
      percentUsed: 73, // round(11/15 * 100)
      isOvertime: false,
    });
  });

  it('treats exactly 15h as fully used but not overtime', () => {
    expect(weeklyBudget(15 * H, 0)).toMatchObject({
      usedSeconds: 15 * H,
      remainingSeconds: 0,
      percentUsed: 100,
      isOvertime: false,
    });
  });

  it('clamps remaining at zero and percent at 100 past the cap, and flags overtime', () => {
    expect(weeklyBudget(16 * H, 0)).toMatchObject({
      usedSeconds: 16 * H,
      remainingSeconds: 0,
      percentUsed: 100,
      isOvertime: true,
    });
  });

  it('floors negative/garbage input at an empty-but-full budget', () => {
    expect(weeklyBudget(-5, 0)).toMatchObject({
      usedSeconds: 0,
      remainingSeconds: WEEKLY_CAP_SECONDS,
      percentUsed: 0,
      isOvertime: false,
    });
  });

  it('defaults the live elapsed to zero (clocked-out view)', () => {
    expect(weeklyBudget(6 * H)).toMatchObject({
      usedSeconds: 6 * H,
      remainingSeconds: 9 * H,
      isOvertime: false,
    });
  });
});
