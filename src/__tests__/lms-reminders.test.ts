import { describe, it, expect } from 'vitest';
import { decideReminder } from '@/lib/lms-reminders';
import { isPathExemptFromHardEnforcement } from '@/lib/lms-enforcement';

const NOW = new Date('2026-06-01T12:00:00.000Z');
const HOURS = (n: number) => new Date(NOW.getTime() + n * 60 * 60 * 1000).toISOString();
const DAYS  = (n: number) => HOURS(n * 24);

describe('decideReminder — completed course', () => {
  it('skips when the course is already complete, even if overdue', () => {
    const r = decideReminder({
      dueAt: DAYS(-2), lastRemindedAt: null,
      courseComplete: true, now: NOW,
    });
    expect(r).toEqual({ send: false, reason: 'course already complete' });
  });
});

describe('decideReminder — window classification', () => {
  it('skips when no due date', () => {
    const r = decideReminder({ dueAt: null, lastRemindedAt: null, courseComplete: false, now: NOW });
    expect(r.send).toBe(false);
  });

  it('skips when more than 7 days out', () => {
    const r = decideReminder({ dueAt: DAYS(10), lastRemindedAt: null, courseComplete: false, now: NOW });
    expect(r).toEqual({ send: false, reason: 'more than 7 days out' });
  });

  it('flags due_7d at exactly 7 days', () => {
    const r = decideReminder({ dueAt: DAYS(7), lastRemindedAt: null, courseComplete: false, now: NOW });
    if (r.send) expect(r.window).toBe('due_7d');
    else throw new Error('expected send=true');
  });

  it('flags due_3d at 3 days out', () => {
    const r = decideReminder({ dueAt: DAYS(3), lastRemindedAt: null, courseComplete: false, now: NOW });
    if (r.send) expect(r.window).toBe('due_3d');
    else throw new Error('expected send=true');
  });

  it('flags due_1d at 1 day out', () => {
    const r = decideReminder({ dueAt: DAYS(1), lastRemindedAt: null, courseComplete: false, now: NOW });
    if (r.send) expect(r.window).toBe('due_1d');
    else throw new Error('expected send=true');
  });

  it('flags overdue when due date is in the past', () => {
    const r = decideReminder({ dueAt: DAYS(-1), lastRemindedAt: null, courseComplete: false, now: NOW });
    if (r.send) expect(r.window).toBe('overdue');
    else throw new Error('expected send=true');
  });
});

describe('decideReminder — cooldown', () => {
  it('skips when last reminder was within 24h', () => {
    const r = decideReminder({
      dueAt: DAYS(1), lastRemindedAt: HOURS(-5),
      courseComplete: false, now: NOW,
    });
    expect(r).toEqual({ send: false, reason: 'last reminder < 24h ago' });
  });

  it('sends when last reminder was > 24h ago', () => {
    const r = decideReminder({
      dueAt: DAYS(1), lastRemindedAt: HOURS(-25),
      courseComplete: false, now: NOW,
    });
    expect(r.send).toBe(true);
  });
});

describe('decideReminder — invalid input', () => {
  it('skips on unparseable due_at', () => {
    const r = decideReminder({
      dueAt: 'not-a-date', lastRemindedAt: null,
      courseComplete: false, now: NOW,
    });
    expect(r).toEqual({ send: false, reason: 'invalid due_at' });
  });
});

describe('isPathExemptFromHardEnforcement', () => {
  it('allows /learning and any subpath', () => {
    expect(isPathExemptFromHardEnforcement('/learning')).toBe(true);
    expect(isPathExemptFromHardEnforcement('/learning/42')).toBe(true);
    expect(isPathExemptFromHardEnforcement('/learning/42/99')).toBe(true);
  });

  it('allows /login, /logout, /profile, /api/*', () => {
    expect(isPathExemptFromHardEnforcement('/login')).toBe(true);
    expect(isPathExemptFromHardEnforcement('/logout')).toBe(true);
    expect(isPathExemptFromHardEnforcement('/profile')).toBe(true);
    expect(isPathExemptFromHardEnforcement('/api/lms/reminders')).toBe(true);
  });

  it('blocks /dashboard, /my-tasks, /projects', () => {
    expect(isPathExemptFromHardEnforcement('/dashboard')).toBe(false);
    expect(isPathExemptFromHardEnforcement('/my-tasks')).toBe(false);
    expect(isPathExemptFromHardEnforcement('/projects')).toBe(false);
  });

  it('treats empty path as exempt (no x-pathname header)', () => {
    expect(isPathExemptFromHardEnforcement('')).toBe(true);
  });
});
