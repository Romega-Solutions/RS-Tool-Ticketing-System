import { describe, it, expect } from 'vitest';
import {
  datesBetween, isValidDateRange, weekdayShortLabel,
  buildTimesheetCsv, type TimesheetMeta, type TimesheetMemberRow,
  buildCustomRangeExport, type CustomRangeApiUser,
} from '@/lib/export-utils';

describe('datesBetween', () => {
  it('returns every ISO date from start to end, inclusive', () => {
    expect(datesBetween('2026-07-01', '2026-07-10')).toEqual([
      '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05',
      '2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10',
    ]);
  });

  it('returns a single-element array when start equals end', () => {
    expect(datesBetween('2026-07-01', '2026-07-01')).toEqual(['2026-07-01']);
  });

  it('crosses a month boundary correctly', () => {
    expect(datesBetween('2026-06-29', '2026-07-02')).toEqual([
      '2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02',
    ]);
  });

  it('returns an empty array when end is before start', () => {
    expect(datesBetween('2026-07-10', '2026-07-01')).toEqual([]);
  });

  it('returns an empty array for malformed input', () => {
    expect(datesBetween('not-a-date', '2026-07-10')).toEqual([]);
    expect(datesBetween('2026-07-01', 'nope')).toEqual([]);
  });
});

describe('isValidDateRange', () => {
  it('accepts a normal forward range', () => {
    expect(isValidDateRange('2026-07-01', '2026-07-10')).toBe(true);
  });

  it('accepts a single-day range', () => {
    expect(isValidDateRange('2026-07-01', '2026-07-01')).toBe(true);
  });

  it('rejects a reversed range', () => {
    expect(isValidDateRange('2026-07-10', '2026-07-01')).toBe(false);
  });

  it('rejects malformed dates', () => {
    expect(isValidDateRange('not-a-date', '2026-07-10')).toBe(false);
    expect(isValidDateRange('2026-07-01', '2026-13-40')).toBe(false);
  });

  it('rejects wrong-format strings even if Date can parse them', () => {
    expect(isValidDateRange('2026/07/01', '2026/07/10')).toBe(false);
  });
});

describe('weekdayShortLabel', () => {
  it('labels known weekdays correctly', () => {
    expect(weekdayShortLabel('2026-06-29')).toBe('Mon');
    expect(weekdayShortLabel('2026-06-30')).toBe('Tue');
    expect(weekdayShortLabel('2026-07-01')).toBe('Wed');
    expect(weekdayShortLabel('2026-07-02')).toBe('Thu');
    expect(weekdayShortLabel('2026-07-05')).toBe('Sun');
  });
});

describe('buildTimesheetCsv (arbitrary-length ranges)', () => {
  const meta: TimesheetMeta = {
    rangeLabel: '1 Jul 2026 - 3 Jul 2026',
    dayDateLabels: ['Jul 1', 'Jul 2', 'Jul 3'],
    dayOfWeekLabels: ['Wed', 'Thu', 'Fri'],
  };
  const rows: TimesheetMemberRow[] = [
    { name: 'Jane Doe', memberCode: 'JD01', daySeconds: [3600, 7200, 0], periodSeconds: 10800, hourlyRateUsd: 10 },
  ];

  it('sizes the weekday header row to the actual number of days, not a hardcoded 7', () => {
    const csv = buildTimesheetCsv(rows, meta);
    expect(csv).toContain(',,,Wed,Thu,Fri');
    expect(csv).not.toContain('Mon');
    expect(csv).not.toContain('SUN');
  });

  it('sizes the date header row to match', () => {
    const csv = buildTimesheetCsv(rows, meta);
    expect(csv).toContain('NAME,MEMBER CODE,TYPE,Jul 1,Jul 2,Jul 3,TOTALS');
  });

  it('formats each day cell and the rate/gross columns for a 3-day range', () => {
    const csv = buildTimesheetCsv(rows, meta);
    expect(csv).toContain('Jane Doe,JD01,Payroll Hours,1h 00m,2h 00m,-,3h 00m,$10.00/h,$30.00');
  });

  it('sums day totals across exactly the provided number of days', () => {
    const csv = buildTimesheetCsv(rows, meta);
    expect(csv).toContain(',,Payroll,1h 00m,2h 00m,-,3h 00m');
  });

  it('sizes the OT placeholder dashes to the provided number of days plus totals', () => {
    const csv = buildTimesheetCsv(rows, meta);
    expect(csv).toContain(',,Daily OT,-,-,-,-');
  });

  it('uses the generic period range label instead of a hardcoded "Week" row', () => {
    const csv = buildTimesheetCsv(rows, meta);
    expect(csv).toContain('Period,1 Jul 2026 - 3 Jul 2026');
    expect(csv).not.toMatch(/^Week,/m);
  });

  it('still works for a full 7-day week (regression)', () => {
    const weekMeta: TimesheetMeta = {
      rangeLabel: '29 Jun 2026 - 5 Jul 2026',
      dayDateLabels: ['Jun 29', 'Jun 30', 'Jul 1', 'Jul 2', 'Jul 3', 'Jul 4', 'Jul 5'],
      dayOfWeekLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    };
    const weekRows: TimesheetMemberRow[] = [
      { name: 'Jane Doe', memberCode: 'JD01', daySeconds: [3600, 3600, 3600, 3600, 3600, 0, 0], periodSeconds: 18000, hourlyRateUsd: null },
    ];
    const csv = buildTimesheetCsv(weekRows, weekMeta);
    expect(csv).toContain(',,,Mon,Tue,Wed,Thu,Fri,Sat,Sun');
    expect(csv).toContain('Jane Doe,JD01,Payroll Hours,1h 00m,1h 00m,1h 00m,1h 00m,1h 00m,-,-,5h 00m');
  });
});

describe('buildCustomRangeExport', () => {
  const users: CustomRangeApiUser[] = [
    { id: 1, name: 'Jane', team: 'Engineering', role: 'ic', memberCode: 'JD01', hourlyRateUsd: 10 },
    { id: 2, name: 'Bob', team: 'Engineering', role: 'ic', memberCode: null, hourlyRateUsd: null },
  ];
  const timesheetsByDay = {
    '1:2026-07-01': 3600,
    '1:2026-07-02': 3600,
    '2:2026-07-01': 1800,
  };

  it('builds a human range label from the raw ISO dates', () => {
    const result = buildCustomRangeExport('2026-07-01', '2026-07-03', users, timesheetsByDay);
    expect(result.rangeLabel).toBe('1 Jul 2026 - 3 Jul 2026');
  });

  it('builds per-day timesheet rows sized to the actual range, not a fixed week', () => {
    const result = buildCustomRangeExport('2026-07-01', '2026-07-03', users, timesheetsByDay);
    expect(result.timesheet.meta.dayDateLabels).toEqual(['Jul 1', 'Jul 2', 'Jul 3']);
    expect(result.timesheet.meta.dayOfWeekLabels).toEqual(['Wed', 'Thu', 'Fri']);
    expect(result.timesheet.rows).toEqual([
      { name: 'Jane', memberCode: 'JD01', daySeconds: [3600, 3600, 0], periodSeconds: 7200, hourlyRateUsd: 10 },
      { name: 'Bob', memberCode: '', daySeconds: [1800, 0, 0], periodSeconds: 1800, hourlyRateUsd: null },
    ]);
  });

  it('computes Wise USD gross per member for the period, null when unrated', () => {
    const result = buildCustomRangeExport('2026-07-01', '2026-07-03', users, timesheetsByDay);
    expect(result.wiseAmounts).toEqual({ Jane: 20, Bob: null });
  });

  it('builds simplified period-total rows for the standard/markdown/json formats', () => {
    const result = buildCustomRangeExport('2026-07-01', '2026-07-03', users, timesheetsByDay);
    expect(result.rows).toEqual([
      { member: 'Jane', team: 'Engineering', period_total_hours: '2h 00m' },
      { member: 'Bob', team: 'Engineering', period_total_hours: '0h 30m' },
    ]);
  });

  it('echoes start/end in jsonMeta and builds a payroll payment reference', () => {
    const result = buildCustomRangeExport('2026-07-01', '2026-07-03', users, timesheetsByDay);
    expect(result.jsonMeta).toEqual({ start: '2026-07-01', end: '2026-07-03' });
    expect(result.wisePaymentReference).toBe('Payroll Period 1 Jul 2026 - 3 Jul 2026');
  });
});
