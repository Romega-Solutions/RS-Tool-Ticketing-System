import { describe, it, expect } from 'vitest';
import { parseActivityUserId } from '@/lib/activity';

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
