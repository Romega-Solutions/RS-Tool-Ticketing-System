import { describe, it, expect } from 'vitest';
import {
  addDaysYmd,
  dayOfWeekYmd,
  isValidYmd,
  mondayOfYmd,
  phtDateOf,
  phtDatesTouched,
  phtWeekStartOf,
} from '@/lib/pht';
import { weekDates, weekStartMonday } from '@/lib/overtime-policy';

describe('phtDateOf — the attendance day runs 12:00 AM–11:59 PM PHT', () => {
  it('keeps a 7:00 AM PHT clock-in on its own day (UTC is still the previous day)', () => {
    // 2026-09-02 07:00 PHT == 2026-09-01T23:00Z
    expect(phtDateOf('2026-09-01T23:00:00.000Z')).toBe('2026-09-02');
  });
  it('flips at PHT midnight, not 8:00 AM PHT', () => {
    expect(phtDateOf('2026-09-01T15:59:59.999Z')).toBe('2026-09-01'); // 11:59:59 PM PHT
    expect(phtDateOf('2026-09-01T16:00:00.000Z')).toBe('2026-09-02'); // 12:00 AM PHT
  });
});

describe('PHT week boundaries', () => {
  it('puts a Monday 7:00 AM PHT clock-in in that Monday\'s week', () => {
    // Mon 2026-08-31 07:00 PHT == Sun 2026-08-30T23:00Z
    expect(phtWeekStartOf('2026-08-30T23:00:00.000Z')).toBe('2026-08-31');
    expect(weekStartMonday(new Date('2026-08-30T23:00:00.000Z'))).toBe('2026-08-31');
  });
  it('keeps Sunday 11:59 PM PHT in the prior week', () => {
    expect(weekStartMonday(new Date('2026-09-06T15:59:00.000Z'))).toBe('2026-08-31');
  });
  it('lists the 7 Mon–Sun PHT dates', () => {
    expect(weekDates(new Date('2026-09-02T04:00:00.000Z'))).toEqual([
      '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06',
    ]);
  });
});

describe('YYYY-MM-DD helpers', () => {
  it('rejects impossible or malformed dates', () => {
    expect(isValidYmd('2026-02-28')).toBe(true);
    expect(isValidYmd('2026-02-30')).toBe(false);
    expect(isValidYmd('2026-2-3')).toBe(false);
    expect(isValidYmd('')).toBe(false);
  });
  it('does day arithmetic across month and year ends', () => {
    expect(addDaysYmd('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDaysYmd('2027-01-01', -1)).toBe('2026-12-31');
  });
  it('finds the weekday and Monday of a date', () => {
    expect(dayOfWeekYmd('2026-09-06')).toBe(0);
    expect(mondayOfYmd('2026-09-06')).toBe('2026-08-31');
    expect(mondayOfYmd('2026-08-31')).toBe('2026-08-31');
  });
  it('lists every PHT date an overnight session touches', () => {
    // Wed 20:00 PHT → Thu 02:00 PHT
    expect(phtDatesTouched('2026-09-02T12:00:00.000Z', '2026-09-02T18:00:00.000Z')).toEqual(['2026-09-02', '2026-09-03']);
  });
});
