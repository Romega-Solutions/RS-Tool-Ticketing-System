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

describe('decideAutoClockOut — no role exemption', () => {
  // Admins and CEOs used to be exempt; that let them rack up unbounded
  // ghost OT (e.g. a 25h open session left behind on tab close). Sweep
  // now applies to every role — only "consent active" can keep a session
  // open past 3h 5min.

  it.each([
    ['admin'],
    ['ceo'],
    ['owner'],
    ['superadmin'],
    ['lead'],
    ['ic'],
    ['intern'],
  ])('closes role=%s past the boundary', (role) => {
    const result = decideAutoClockOut({
      clockedInAt:          clockedInAgo(BOUNDARY + 60),
      role,
      overtimeConsentUntil: null,
      now:                  NOW,
    });
    expect(result.action).toBe('close');
  });

  it('treats null role as a regular session and closes', () => {
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
  // Order: response window → consent.

  it('reports "within response window" when role is admin and session is sub-3h5m', () => {
    const result = decideAutoClockOut({
      clockedInAt:          clockedInAgo(60), // 1 minute ago
      role:                 'admin',
      overtimeConsentUntil: null,
      now:                  NOW,
    });
    expect(result).toEqual({ action: 'skip', reason: 'within response window' });
  });

  it('reports "consent active" for an admin past the boundary with live consent', () => {
    const consentUntil = new Date(NOW.getTime() + 60_000).toISOString();
    const result = decideAutoClockOut({
      clockedInAt:          clockedInAgo(BOUNDARY + 60),
      role:                 'ceo',
      overtimeConsentUntil: consentUntil,
      now:                  NOW,
    });
    expect(result).toEqual({ action: 'skip', reason: 'consent active' });
  });
});
