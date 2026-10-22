import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  planMilestone, milestoneSendDate, shiftWeekendToMonday, sowBadge, isSowEnding,
  sowCcRecipients, sowAlertMode, resolveLaunchCutoff, sowBellBody, cronUtcToManila, parseIsoDate, daysBetween, type SowPerson,
} from '@/lib/sow-alerts';

// 2026-12-31 is a Thursday. Milestones: -75 = 2026-10-17 (Sat), -60 = 2026-11-01 (Sun),
// -45 = 2026-11-16 (Mon).
const END = '2026-12-31';

describe('date helpers', () => {
  it('rejects invalid and non-ISO dates', () => {
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('12/31/2026')).toBeNull();
    expect(parseIsoDate('')).toBeNull();
    expect(parseIsoDate('2026-12-31')).not.toBeNull();
  });
  it('counts days', () => {
    expect(daysBetween('2026-10-22', '2026-10-23')).toBe(1);
    expect(daysBetween('2026-10-23', '2026-10-22')).toBe(-1);
  });
  it('shifts weekends to Monday', () => {
    expect(shiftWeekendToMonday('2026-10-17')).toBe('2026-10-19'); // Sat
    expect(shiftWeekendToMonday('2026-10-18')).toBe('2026-10-19'); // Sun
    expect(shiftWeekendToMonday('2026-10-16')).toBe('2026-10-16'); // Fri
  });
  it('milestone send dates', () => {
    expect(milestoneSendDate(END, 75)).toBe('2026-10-19');
    expect(milestoneSendDate(END, 60)).toBe('2026-11-02');
    expect(milestoneSendDate(END, 45)).toBe('2026-11-16');
  });
});

describe('planMilestone', () => {
  it('Saturday milestone does not send on Friday, sends Monday', () => {
    expect(planMilestone(END, '2026-10-16').send).toBeNull();
    expect(planMilestone(END, '2026-10-19').send).toBe(75);
  });
  it('Sunday milestone sends Monday', () => {
    expect(planMilestone(END, '2026-11-02').send).toBe(60);
  });
  it('Friday milestone sends Friday', () => {
    // 2027-01-15 - 45 = 2026-12-01? use an end date whose -60 is a Friday:
    // 2026-12-25 - 60 = 2026-10-26 (Mon). 2026-12-29 - 60 = 2026-10-30 (Fri).
    expect(milestoneSendDate('2026-12-29', 60)).toBe('2026-10-30');
    expect(planMilestone('2026-12-29', '2026-10-30').send).toBe(60);
  });
  it('double run sends once (dedupe on recorded milestones)', () => {
    expect(planMilestone(END, '2026-10-19', new Set([75])).send).toBeNull();
  });
  it('missed day catches up while still the current milestone', () => {
    expect(planMilestone(END, '2026-10-21').send).toBe(75);
  });
  it('stops once the next milestone window is reached', () => {
    // 60 days left: 75 is no longer current; 60's send date (Mon 11-02) not yet.
    expect(planMilestone(END, '2026-11-01', new Set()).send).toBeNull();
  });
  it('an unsent older milestone past its window never sends late', () => {
    // 75 was never recorded, but with 60 days left only 60 is current.
    const p = planMilestone('2026-12-29', '2026-10-30');
    expect(p.send).toBe(60);
    expect(p.skip).toEqual([]);
  });
  it('no backfill before the launch cutoff', () => {
    expect(planMilestone(END, '2026-10-21', new Set(), '2026-10-20').send).toBeNull();
    expect(planMilestone(END, '2026-10-19', new Set(), '2026-10-19').send).toBe(75);
  });
  it('end-date change restarts the schedule (dedupe is per end date)', () => {
    const recordedForOldDate = new Set<number>(); // nothing recorded for the new date
    expect(planMilestone('2027-01-04', '2026-10-21', recordedForOldDate).send).toBe(75);
  });
  it('past, today and invalid dates never send', () => {
    expect(planMilestone('1975-12-15', '2026-10-22').send).toBeNull();
    expect(planMilestone('2026-10-22', '2026-10-22').send).toBeNull();
    expect(planMilestone('garbage', '2026-10-22').send).toBeNull();
    expect(planMilestone(null, '2026-10-22').send).toBeNull();
  });
});

describe('badge and filter', () => {
  const today = '2026-10-22';
  it('labels', () => {
    expect(sowBadge('2026-10-23', today)).toMatchObject({ kind: 'ending', days: 1, urgent: true, label: 'SOW ends in 1 day' });
    expect(sowBadge('2026-12-20', today)).toMatchObject({ kind: 'ending', days: 59, urgent: false });
    expect(sowBadge('2027-01-05', today)).toMatchObject({ kind: 'ending', days: 75 });
    expect(sowBadge('2027-01-06', today)).toBeNull();
    expect(sowBadge('1975-12-15', today)).toMatchObject({ kind: 'ended' });
    expect(sowBadge('2026-10-22', today)).toMatchObject({ label: 'SOW ends today' });
    expect(sowBadge(null, today)).toBeNull();
  });
  it('filter excludes ended and far-future', () => {
    expect(isSowEnding('2026-11-11', today)).toBe(true);
    expect(isSowEnding('1975-12-15', today)).toBe(false);
    expect(isSowEnding('2027-06-01', today)).toBe(false);
  });
});

describe('sowCcRecipients', () => {
  const people = new Map<number, SowPerson>([
    [1, { id: 1, email: 'ceo@x', isActive: true }],
    [2, { id: 2, email: 'head@x', isActive: true }],
    [3, { id: 3, email: 'lead@x', isActive: true }],
    [4, { id: 4, email: 'ic@x', isActive: true }],
    [5, { id: 5, email: 'gone@x', isActive: false }],
  ]);
  it('lead and the lead’s lead', () => {
    const r = sowCcRecipients(4, new Map([[4, 3], [3, 2]]), people, 1);
    expect(r.ccIds).toEqual([3, 2]);
    expect(r.usedFounderFallback).toBe(false);
  });
  it('CEO fallback when the second level is missing', () => {
    const r = sowCcRecipients(4, new Map([[4, 3]]), people, 1);
    expect(r.ccIds).toEqual([3, 1]);
    expect(r.usedFounderFallback).toBe(true);
  });
  it('no lead: CEO only', () => {
    const r = sowCcRecipients(4, new Map(), people, 1);
    expect(r).toMatchObject({ ccIds: [1], leadId: null });
  });
  it('inactive lead is skipped', () => {
    const r = sowCcRecipients(4, new Map([[4, 5], [5, 2]]), people, 1);
    expect(r.ccIds).toEqual([2]);
  });
  it('no duplicate when the second level is the CEO', () => {
    expect(sowCcRecipients(3, new Map([[3, 2], [2, 1]]), people, 1).ccIds).toEqual([2, 1]);
  });
});

describe('mode and schedule', () => {
  it('defaults to log-only', () => {
    expect(sowAlertMode(undefined)).toBe('log');
    expect(sowAlertMode('yes')).toBe('log');
    expect(sowAlertMode('SEND')).toBe('send');
    expect(sowAlertMode('off')).toBe('off');
  });
  it('vercel cron fires at 21:00 Manila on weekdays', () => {
    const crons = JSON.parse(readFileSync('vercel.json', 'utf8')).crons as Array<{ path: string; schedule: string }>;
    const c = crons.find(x => x.path === '/api/cron/sow-end-reminders');
    expect(c?.schedule).toBe('0 13 * * 1-5');
    expect(cronUtcToManila(c!.schedule)).toEqual({ hour: 21, minute: 0, days: '1-5' });
  });
});

describe('launch cutoff', () => {
  const today = '2026-10-22';
  it('send mode without a start date: cutoff is today (no backfill)', () => {
    expect(resolveLaunchCutoff('send', undefined, today)).toBe(today);
    expect(resolveLaunchCutoff('send', '  ', today)).toBe(today);
    expect(resolveLaunchCutoff('send', 'not-a-date', today)).toBe(today);
    // A Monday milestone missed by one day does not send once sends are on.
    expect(planMilestone(END, '2026-10-20', new Set(), resolveLaunchCutoff('send', undefined, '2026-10-20')).send).toBeNull();
    expect(planMilestone(END, '2026-10-19', new Set(), resolveLaunchCutoff('send', undefined, '2026-10-19')).send).toBe(75);
  });
  it('a valid start date wins in any mode', () => {
    expect(resolveLaunchCutoff('send', '2026-10-01', today)).toBe('2026-10-01');
    expect(resolveLaunchCutoff('log', '2026-10-01', today)).toBe('2026-10-01');
  });
  it('log mode keeps a short catch-up window', () => {
    expect(resolveLaunchCutoff('log', undefined, today)).toBe('2026-10-18');
  });
});

describe('bell body', () => {
  it('flags a failed email', () => {
    expect(sowBellBody('Body.', true)).toBe('Body.');
    expect(sowBellBody('Body.', false)).toBe('Body. (email failed)');
  });
});
