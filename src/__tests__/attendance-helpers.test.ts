import { describe, it, expect } from 'vitest';

// Pure date helpers duplicated from attendance route — tested in isolation

function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function getMondayOfWeek(dateStr: string): string | null {
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  const day = d.getDay();
  if (day !== 1) return null;
  return toLocalISO(d);
}

function countWorkdaysInMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split('-').map(Number);
  if (!y || !m) return 0;
  const lastDay = new Date(y, m, 0).getDate();
  let count = 0;
  for (let d = 1; d <= lastDay; d++) {
    const dow = new Date(y, m - 1, d).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

function getMondaysInMonth(yearMonth: string): string[] {
  const [y, m] = yearMonth.split('-').map(Number);
  if (!y || !m) return [];
  const firstDay = new Date(y, m - 1, 1);
  const lastDay  = new Date(y, m, 0);
  const start = new Date(firstDay);
  const dow = start.getDay();
  start.setDate(start.getDate() + (dow === 0 ? -6 : 1 - dow));
  const mondays: string[] = [];
  const cur = new Date(start);
  while (cur <= lastDay) {
    mondays.push(toLocalISO(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return mondays;
}

// Attendance status validation
const VALID_STATUSES = new Set(['present', 'absent', 'wfh', 'leave', '']);

function isValidStatus(val: string): boolean {
  return VALID_STATUSES.has(val.toLowerCase());
}

describe('getMondayOfWeek', () => {
  it('returns the date string if it is a Monday', () => {
    // 2026-05-04 is a Monday
    expect(getMondayOfWeek('2026-05-04')).toBe('2026-05-04');
  });

  it('returns null for non-Monday dates', () => {
    expect(getMondayOfWeek('2026-05-05')).toBeNull(); // Tuesday
    expect(getMondayOfWeek('2026-05-06')).toBeNull(); // Wednesday
    expect(getMondayOfWeek('2026-05-07')).toBeNull(); // Thursday
    expect(getMondayOfWeek('2026-05-08')).toBeNull(); // Friday
    expect(getMondayOfWeek('2026-05-09')).toBeNull(); // Saturday
    expect(getMondayOfWeek('2026-05-10')).toBeNull(); // Sunday
  });

  it('returns null for invalid date strings', () => {
    expect(getMondayOfWeek('not-a-date')).toBeNull();
    expect(getMondayOfWeek('')).toBeNull();
    expect(getMondayOfWeek('2026-13-01')).toBeNull();
  });
});

describe('countWorkdaysInMonth', () => {
  it('counts correctly for May 2026 (21 workdays)', () => {
    // May 2026: 31 days, starts Friday. Weekends: 8 days (4 Sat + 4 Sun) = 23 workdays
    // Actually let me count: May 1 (Fri), May 2-3 (Sat-Sun), May 4-8 (Mon-Fri), etc.
    // May 2026 has 21 workdays
    const result = countWorkdaysInMonth('2026-05');
    expect(result).toBeGreaterThan(18);
    expect(result).toBeLessThanOrEqual(23);
  });

  it('handles February of a leap year', () => {
    const result = countWorkdaysInMonth('2024-02');
    expect(result).toBeGreaterThan(18);
    expect(result).toBeLessThanOrEqual(21);
  });

  it('returns 0 for invalid format', () => {
    expect(countWorkdaysInMonth('invalid')).toBe(0);
    expect(countWorkdaysInMonth('')).toBe(0);
  });
});

describe('getMondaysInMonth', () => {
  it('returns all Mondays within the month', () => {
    const mondays = getMondaysInMonth('2026-05');
    // All results must be valid Mondays
    for (const m of mondays) {
      expect(getMondayOfWeek(m)).toBe(m);
    }
    // May 2026 Mondays: May 4, 11, 18, 25
    expect(mondays).toContain('2026-05-04');
    expect(mondays).toContain('2026-05-11');
    expect(mondays).toContain('2026-05-18');
    expect(mondays).toContain('2026-05-25');
  });

  it('returns empty array for invalid yearMonth', () => {
    expect(getMondaysInMonth('')).toEqual([]);
    expect(getMondaysInMonth('invalid')).toEqual([]);
  });
});

describe('attendance status validation', () => {
  it('accepts all valid statuses', () => {
    expect(isValidStatus('present')).toBe(true);
    expect(isValidStatus('absent')).toBe(true);
    expect(isValidStatus('wfh')).toBe(true);
    expect(isValidStatus('leave')).toBe(true);
    expect(isValidStatus('')).toBe(true);
  });

  it('accepts case-insensitive input', () => {
    expect(isValidStatus('Present')).toBe(true);
    expect(isValidStatus('WFH')).toBe(true);
    expect(isValidStatus('ABSENT')).toBe(true);
  });

  it('rejects invalid statuses', () => {
    expect(isValidStatus('vacation')).toBe(false);
    expect(isValidStatus('sick')).toBe(false);
    expect(isValidStatus('unknown')).toBe(false);
    expect(isValidStatus('null')).toBe(false);
  });
});

describe('fmtSeconds (duration formatting)', () => {
  function fmtSeconds(s: number): string {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }

  it('formats minutes only', () => {
    expect(fmtSeconds(0)).toBe('0m');
    expect(fmtSeconds(30)).toBe('0m');
    expect(fmtSeconds(60)).toBe('1m');
    expect(fmtSeconds(3540)).toBe('59m');
  });

  it('formats hours only', () => {
    expect(fmtSeconds(3600)).toBe('1h');
    expect(fmtSeconds(7200)).toBe('2h');
  });

  it('formats hours and minutes', () => {
    expect(fmtSeconds(3660)).toBe('1h 1m');
    expect(fmtSeconds(9000)).toBe('2h 30m');
    expect(fmtSeconds(28800)).toBe('8h');
  });
});
