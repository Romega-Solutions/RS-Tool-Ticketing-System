import { describe, it, expect } from 'vitest';
import {
  OVERTIME_THRESHOLD_SECONDS,
  isOvertime,
  computeOvertime,
} from '@/lib/utils';

describe('OVERTIME_THRESHOLD_SECONDS', () => {
  it('is 3 hours in seconds', () => {
    expect(OVERTIME_THRESHOLD_SECONDS).toBe(10800);
  });
});

describe('isOvertime', () => {
  it('is false below the 3h threshold', () => {
    expect(isOvertime(0)).toBe(false);
    expect(isOvertime(10799)).toBe(false);
  });

  it('is true at exactly 3h and beyond', () => {
    expect(isOvertime(10800)).toBe(true);
    expect(isOvertime(20000)).toBe(true);
  });

  it('handles negative/garbage input as not overtime', () => {
    expect(isOvertime(-5)).toBe(false);
  });
});

describe('computeOvertime', () => {
  it('reports no overtime for a sub-3h session', () => {
    expect(computeOvertime(3600)).toEqual({ isOvertime: false, overtimeSeconds: 0 });
  });

  it('reports zero overtime seconds exactly at the threshold', () => {
    expect(computeOvertime(10800)).toEqual({ isOvertime: true, overtimeSeconds: 0 });
  });

  it('reports seconds past the threshold for an overtime session', () => {
    expect(computeOvertime(12600)).toEqual({ isOvertime: true, overtimeSeconds: 1800 });
  });

  it('floors negative durations at zero overtime', () => {
    expect(computeOvertime(-100)).toEqual({ isOvertime: false, overtimeSeconds: 0 });
  });
});
