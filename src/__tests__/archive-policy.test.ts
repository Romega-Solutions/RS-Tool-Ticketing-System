import { describe, it, expect } from 'vitest';
import { normalizeProjectPatch } from '@/lib/tickets';

describe('auto-archive window validation (normalizeProjectPatch)', () => {
  it('treats 0 as "off" (null)', () => {
    expect(normalizeProjectPatch({ autoArchiveDoneDays: 0 }).autoArchiveDoneDays).toBeNull();
  });

  it('treats null as "off" (null)', () => {
    expect(normalizeProjectPatch({ autoArchiveDoneDays: null }).autoArchiveDoneDays).toBeNull();
  });

  it('rejects negatives as "off" (null)', () => {
    expect(normalizeProjectPatch({ autoArchiveDoneDays: -5 }).autoArchiveDoneDays).toBeNull();
  });

  it('passes a valid window through unchanged', () => {
    expect(normalizeProjectPatch({ autoArchiveDoneDays: 30 }).autoArchiveDoneDays).toBe(30);
  });

  it('floors fractional days', () => {
    expect(normalizeProjectPatch({ autoArchiveDoneDays: 30.7 }).autoArchiveDoneDays).toBe(30);
  });

  it('clamps absurdly large windows to 365', () => {
    expect(normalizeProjectPatch({ autoArchiveDoneDays: 100000 }).autoArchiveDoneDays).toBe(365);
  });

  it('omits the key entirely when not provided (no accidental write)', () => {
    expect('autoArchiveDoneDays' in normalizeProjectPatch({ name: 'X' })).toBe(false);
  });
});
