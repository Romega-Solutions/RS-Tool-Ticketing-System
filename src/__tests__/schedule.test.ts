import { describe, it, expect } from 'vitest';
import { phtToPacific, pacificRange, formatPhtRange } from '@/lib/schedule';

// PHT (UTC+8, no DST) → US Pacific. Winter = PST (PHT − 16h), summer = PDT (PHT − 15h).
describe('phtToPacific (DST-aware, IANA America/Los_Angeles)', () => {
  it('winter date → PST (PHT − 16h)', () => {
    expect(phtToPacific('21:00', new Date('2027-01-15T00:00:00+08:00'))).toEqual({ time: '05:00', zone: 'PST' });
  });
  it('summer date → PDT (PHT − 15h)', () => {
    expect(phtToPacific('21:00', new Date('2027-07-15T00:00:00+08:00'))).toEqual({ time: '06:00', zone: 'PDT' });
  });
  it('holds across future years (next 15y)', () => {
    expect(phtToPacific('21:00', new Date('2031-01-15T00:00:00+08:00')).zone).toBe('PST');
    expect(phtToPacific('21:00', new Date('2035-01-15T00:00:00+08:00')).zone).toBe('PST');
    expect(phtToPacific('21:00', new Date('2040-07-15T00:00:00+08:00')).zone).toBe('PDT');
  });
  it('converts a midnight endpoint', () => {
    expect(phtToPacific('00:00', new Date('2027-01-15T00:00:00+08:00')).time).toBe('08:00');
  });
});

describe('formatPhtRange / pacificRange', () => {
  it('formats a PHT range', () => {
    expect(formatPhtRange('21:00', '00:00')).toBe('21:00 - 00:00');
  });
  it('returns "" when a PHT endpoint is missing', () => {
    expect(formatPhtRange('21:00', null)).toBe('');
  });
  it('derives a Pacific range + zone', () => {
    expect(pacificRange('21:00', '00:00', new Date('2027-01-15T00:00:00+08:00'))).toEqual({ range: '05:00 - 08:00', zone: 'PST' });
  });
  it('returns null when either side is missing or malformed', () => {
    expect(pacificRange(null, '00:00')).toBeNull();
    expect(pacificRange('9am', '00:00')).toBeNull();
  });
});
