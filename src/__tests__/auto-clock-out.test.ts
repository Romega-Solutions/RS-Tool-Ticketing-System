import { describe, it, expect } from 'vitest';
import { decideAutoClockOut, RESPONSE_WINDOW_SECONDS } from '@/lib/auto-clock-out';
import { OVERTIME_THRESHOLD_SECONDS } from '@/lib/utils';

// Cron skip-decision tests. Verifies the pure logic shared by
// /api/cron/auto-clock-out without needing Supabase or HTTP plumbing.

const NOW = new Date('2026-05-27T12:00:00.000Z');

// Helper: build a clocked_in_at timestamp `seconds` ago relative to NOW.
const clockedInAgo = (seconds: number) =>
  new Date(NOW.getTime() - seconds * 1000).toISOString();

const BOUNDARY = OVERTIME_THRESHOLD_SECONDS + RESPONSE_WINDOW_SECONDS; // 11100s = 3h 5min

describe('decideAutoClockOut — response window', () => {
  it('skips a session that has not yet crossed 3h 5min', () => {
    const result = decideAutoClockOut({
      clockedInAt:          clockedInAgo(BOUNDARY - 1),
      role:                 'ic',
      overtimeConsentUntil: null,
      now:                  NOW,
    });
    expect(result).toEqual({ action: 'skip', reason: 'within response window' });
  });

  it('closes a session at exactly 3h 5min', () => {
    const result = decideAutoClockOut({
      clockedInAt:          clockedInAgo(BOUNDARY),
      role:                 'ic',
      overtimeConsentUntil: null,
      now:                  NOW,
    });
    expect(result).toEqual({ action: 'close', elapsedSec: BOUNDARY });
  });

  it('closes a session that is well past the boundary and reports exact elapsed seconds', () => {
    const result = decideAutoClockOut({
      clockedInAt:          clockedInAgo(BOUNDARY + 1234),
      role:                 'lead',
      overtimeConsentUntil: null,
      now:                  NOW,
    });
    expect(result).toEqual({ action: 'close', elapsedSec: BOUNDARY + 1234 });
  });
});

describe('decideAutoClockOut — role exemption', () => {
  it('skips admin', () => {
    const result = decideAutoClockOut({
      clockedInAt:          clockedInAgo(BOUNDARY + 60),
      role:                 'admin',
      overtimeConsentUntil: null,
      now:                  NOW,
    });
    expect(result).toEqual({ action: 'skip', reason: 'admin/ceo exempt' });
  });

  it('skips ceo (normalizes to admin)', () => {
    const result = decideAutoClockOut({
      clockedInAt:          clockedInAgo(BOUNDARY + 60),
      role:                 'ceo',
      overtimeConsentUntil: null,
      now:                  NOW,
    });
    expect(result).toEqual({ action: 'skip', reason: 'admin/ceo exempt' });
  });

  it('skips owner', () => {
    const result = decideAutoClockOut({
      clockedInAt:          clockedInAgo(BOUNDARY + 60),
      role:                 'owner',
      overtimeConsentUntil: null,
      now:                  NOW,
    });
    expect(result).toEqual({ action: 'skip', reason: 'admin/ceo exempt' });
  });

  it('skips superadmin', () => {
    const result = decideAutoClockOut({
      clockedInAt:          clockedInAgo(BOUNDARY + 60),
      role:                 'superadmin',
      overtimeConsentUntil: null,
      now:                  NOW,
    });
    expect(result).toEqual({ action: 'skip', reason: 'admin/ceo exempt' });
  });

  it('closes lead (not exempt — leads are non-technical PMs per project memory)', () => {
    const result = decideAutoClockOut({
      clockedInAt:          clockedInAgo(BOUNDARY + 60),
      role:                 'lead',
      overtimeConsentUntil: null,
      now:                  NOW,
    });
    expect(result.action).toBe('close');
  });

  it('closes intern', () => {
    const result = decideAutoClockOut({
      clockedInAt:          clockedInAgo(BOUNDARY + 60),
      role:                 'intern',
      overtimeConsentUntil: null,
      now:                  NOW,
    });
    expect(result.action).toBe('close');
  });

  it('treats null/empty role as non-admin (default to "ic" — closes)', () => {
    const result = decideAutoClockOut({
      clockedInAt:          clockedInAgo(BOUNDARY + 60),
      role:                 null,
      overtimeConsentUntil: null,
      now:                  NOW,
    });
    expect(result.action).toBe('close');
  });
});

describe('decideAutoClockOut — consent grace', () => {
  it('skips when consent is still live (now < consent_until)', () => {
    const consentUntil = new Date(NOW.getTime() + 60_000).toISOString(); // 60s in the future
    const result = decideAutoClockOut({
      clockedInAt:          clockedInAgo(BOUNDARY + 60),
      role:                 'ic',
      overtimeConsentUntil: consentUntil,
      now:                  NOW,
    });
    expect(result).toEqual({ action: 'skip', reason: 'consent active' });
  });

  it('skips when consent expired but within the 5min cron grace', () => {
    // Consent expired 4 minutes ago — cron grace is +5min, so still skipped.
    const consentUntil = new Date(NOW.getTime() - 4 * 60 * 1000).toISOString();
    const result = decideAutoClockOut({
      clockedInAt:          clockedInAgo(BOUNDARY + 60),
      role:                 'ic',
      overtimeConsentUntil: consentUntil,
      now:                  NOW,
    });
    expect(result).toEqual({ action: 'skip', reason: 'consent active' });
  });

  it('closes when consent expired > 5min ago (grace fully elapsed)', () => {
    const consentUntil = new Date(NOW.getTime() - 6 * 60 * 1000).toISOString();
    const result = decideAutoClockOut({
      clockedInAt:          clockedInAgo(BOUNDARY + 60),
      role:                 'ic',
      overtimeConsentUntil: consentUntil,
      now:                  NOW,
    });
    expect(result.action).toBe('close');
  });

  it('ignores garbage consent value and proceeds to close', () => {
    const result = decideAutoClockOut({
      clockedInAt:          clockedInAgo(BOUNDARY + 60),
      role:                 'ic',
      overtimeConsentUntil: 'not-a-date',
      now:                  NOW,
    });
    expect(result.action).toBe('close');
  });
});

describe('decideAutoClockOut — invalid input', () => {
  it('skips when clocked_in_at is unparseable', () => {
    const result = decideAutoClockOut({
      clockedInAt:          'not-a-date',
      role:                 'ic',
      overtimeConsentUntil: null,
      now:                  NOW,
    });
    expect(result).toEqual({ action: 'skip', reason: 'invalid clocked_in_at' });
  });
});

describe('decideAutoClockOut — skip-order priority', () => {
  // If MULTIPLE skip reasons could apply, the cheapest check should win.
  // Order: response window → admin exempt → consent. This documents the
  // current cron behavior — a sub-3h5m admin gets "within response window",
  // not "admin/ceo exempt".

  it('reports "within response window" when both that and admin apply', () => {
    const result = decideAutoClockOut({
      clockedInAt:          clockedInAgo(60), // 1 minute ago
      role:                 'admin',
      overtimeConsentUntil: null,
      now:                  NOW,
    });
    expect(result).toEqual({ action: 'skip', reason: 'within response window' });
  });

  it('reports "admin/ceo exempt" when both that and active consent apply', () => {
    const consentUntil = new Date(NOW.getTime() + 60_000).toISOString();
    const result = decideAutoClockOut({
      clockedInAt:          clockedInAgo(BOUNDARY + 60),
      role:                 'ceo',
      overtimeConsentUntil: consentUntil,
      now:                  NOW,
    });
    expect(result).toEqual({ action: 'skip', reason: 'admin/ceo exempt' });
  });
});
