import { describe, it, expect } from 'vitest';
import { parseActivityUserId, auditUserFilter, formatRelativeTime, formatManilaDateTime } from '@/lib/activity';

describe('parseActivityUserId', () => {
  it('treats missing/empty as the global feed (null)', () => {
    expect(parseActivityUserId(null)).toEqual({ ok: true, userId: null });
    expect(parseActivityUserId('')).toEqual({ ok: true, userId: null });
  });
  it('accepts a positive integer', () => {
    expect(parseActivityUserId('42')).toEqual({ ok: true, userId: 42 });
  });
  it('rejects zero, negatives, and non-integers', () => {
    expect(parseActivityUserId('0')).toEqual({ ok: false });
    expect(parseActivityUserId('-3')).toEqual({ ok: false });
    expect(parseActivityUserId('1.5')).toEqual({ ok: false });
    expect(parseActivityUserId('abc')).toEqual({ ok: false });
  });
});

describe('auditUserFilter', () => {
  it('matches what the person did OR what was done to them', () => {
    expect(auditUserFilter(42)).toBe('actor_id.eq.42,target_user_id.eq.42');
  });
  it('refuses anything but a positive integer', () => {
    expect(() => auditUserFilter(0)).toThrow();
    expect(() => auditUserFilter(1.5)).toThrow();
    expect(() => auditUserFilter(Number.NaN)).toThrow();
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-10-20T04:00:00Z'); // Oct 20, 12:00 PM PHT
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const MIN = 60_000;
  it('shows minutes, then hours, then days', () => {
    expect(formatRelativeTime(ago(20_000), now)).toBe('just now');
    expect(formatRelativeTime(ago(1 * MIN), now)).toBe('1 minute ago');
    expect(formatRelativeTime(ago(59 * MIN), now)).toBe('59 minutes ago');
    expect(formatRelativeTime(ago(60 * MIN), now)).toBe('1 hour ago');
    expect(formatRelativeTime(ago(125 * MIN), now)).toBe('2 hours ago');
    expect(formatRelativeTime(ago(26 * 60 * MIN), now)).toBe('1 day ago');
    expect(formatRelativeTime(ago(6 * 24 * 60 * MIN), now)).toBe('6 days ago');
  });
  it('switches to the Manila date after 7 days', () => {
    expect(formatRelativeTime('2026-10-12T17:00:00Z', now)).toBe('Oct 13'); // 1:00 AM PHT on Oct 13
    expect(formatRelativeTime('2025-12-31T20:00:00Z', now)).toBe('Jan 1'); // already 2026 in Manila
    expect(formatRelativeTime('2025-06-01T00:00:00Z', now)).toBe('Jun 1, 2025');
  });
  it('returns an empty string for a bad timestamp', () => {
    expect(formatRelativeTime('nope', now)).toBe('');
  });
});

describe('formatManilaDateTime', () => {
  it('shows the exact time in Manila (UTC+8) with seconds', () => {
    expect(formatManilaDateTime('2026-10-19T16:55:03Z')).toBe('Oct 20, 2026, 12:55:03 AM PHT');
    expect(formatManilaDateTime('2026-10-20T05:07:09.123Z')).toBe('Oct 20, 2026, 1:07:09 PM PHT');
  });
  it('returns an empty string for a bad timestamp', () => {
    expect(formatManilaDateTime('')).toBe('');
  });
});
