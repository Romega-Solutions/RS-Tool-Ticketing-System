import { describe, it, expect } from 'vitest';
import {
  DEFAULT_NOTIFICATION_PREFS,
  mergeNotificationPrefs,
  shouldEmailNotification,
  parseTaskIdFromLink,
  newlyAddedAssignees,
  type NotificationPrefs,
} from '@/lib/notifications';
import { renderNotificationEmail } from '@/lib/email-templates';

const allOn: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS };

describe('mergeNotificationPrefs', () => {
  it('defaults everything ON for null/garbage input', () => {
    expect(mergeNotificationPrefs(null)).toEqual(allOn);
    expect(mergeNotificationPrefs(undefined)).toEqual(allOn);
    expect(mergeNotificationPrefs('nope')).toEqual(allOn);
    expect(mergeNotificationPrefs(42)).toEqual(allOn);
  });

  it('overlays a partial blob over the all-on defaults (missing keys stay ON)', () => {
    const merged = mergeNotificationPrefs({ email: false, mentions: false });
    expect(merged.email).toBe(false);
    expect(merged.mentions).toBe(false);
    expect(merged.dueToday).toBe(true);
    expect(merged.approvals).toBe(true);
    expect(merged.projectAdded).toBe(true);
    expect(merged.taskAdded).toBe(true);
  });

  it('ignores non-boolean values', () => {
    const merged = mergeNotificationPrefs({ email: 'false', dueToday: 0 });
    expect(merged.email).toBe(true);
    expect(merged.dueToday).toBe(true);
  });
});

describe('shouldEmailNotification — prefs gating', () => {
  it('emails when the master switch and the per-event switch are both ON', () => {
    expect(shouldEmailNotification('mentioned', allOn)).toBe(true);
    expect(shouldEmailNotification('task_due', allOn)).toBe(true);
    expect(shouldEmailNotification('task_assigned', allOn)).toBe(true);
    expect(shouldEmailNotification('project_added', allOn)).toBe(true);
    expect(shouldEmailNotification('time_edit_decided', allOn)).toBe(true);
  });

  it('suppresses ALL email when the master `email` switch is OFF', () => {
    const prefs = { ...allOn, email: false };
    expect(shouldEmailNotification('mentioned', prefs)).toBe(false);
    expect(shouldEmailNotification('task_assigned', prefs)).toBe(false);
    expect(shouldEmailNotification('project_added', prefs)).toBe(false);
  });

  it('suppresses email when the matching per-event toggle is OFF', () => {
    expect(shouldEmailNotification('mentioned', { ...allOn, mentions: false })).toBe(false);
    expect(shouldEmailNotification('task_due', { ...allOn, dueToday: false })).toBe(false);
    expect(shouldEmailNotification('task_assigned', { ...allOn, taskAdded: false })).toBe(false);
    expect(shouldEmailNotification('project_added', { ...allOn, projectAdded: false })).toBe(false);
    expect(shouldEmailNotification('time_edit_decided', { ...allOn, approvals: false })).toBe(false);
  });

  it('never emails an unmapped type even with everything ON (in-app bell only)', () => {
    expect(shouldEmailNotification('time_edit_requested', allOn)).toBe(false);
  });
});

describe('parseTaskIdFromLink', () => {
  it('extracts the numeric task id from a project deep link', () => {
    expect(parseTaskIdFromLink('/projects/3?task=42')).toBe(42);
    expect(parseTaskIdFromLink('/projects/3?task=42&comment=7')).toBe(42);
    expect(parseTaskIdFromLink('/projects/3?foo=1&task=99')).toBe(99);
  });

  it('returns null when there is no task param', () => {
    expect(parseTaskIdFromLink('/projects/3')).toBeNull();
    expect(parseTaskIdFromLink('/my-time')).toBeNull();
    expect(parseTaskIdFromLink(null)).toBeNull();
    expect(parseTaskIdFromLink(undefined)).toBeNull();
    expect(parseTaskIdFromLink('/projects/3?task=abc')).toBeNull();
  });
});

describe('newlyAddedAssignees', () => {
  it('returns ids present in after but not before', () => {
    expect(newlyAddedAssignees([1, 2], [1, 2, 3])).toEqual([3]);
    expect(newlyAddedAssignees([], [5, 6])).toEqual([5, 6]);
  });

  it('returns empty when nothing was added (removals do not count)', () => {
    expect(newlyAddedAssignees([1, 2, 3], [1])).toEqual([]);
    expect(newlyAddedAssignees([1, 2], [1, 2])).toEqual([]);
  });

  it('normalizes string ids (getWorkItemDetail returns assignee_ids as strings)', () => {
    expect(newlyAddedAssignees(['1', '2'], [2, 3])).toEqual([3]);
  });

  it('de-dupes and drops non-finite ids', () => {
    expect(newlyAddedAssignees([1], [2, 2, 3])).toEqual([2, 3]);
    expect(newlyAddedAssignees([1], [NaN, 2])).toEqual([2]);
  });
});

describe('renderNotificationEmail', () => {
  it('builds a task email with Title/Description/Priority/Due Date and ONE CTA', () => {
    const r = renderNotificationEmail({
      title: 'You were assigned to "Ship the thing"',
      body: 'You have been added as an assignee on this task.',
      link: '/projects/3?task=42',
      task: { title: 'Ship the thing', description: '<p>Do the <b>work</b></p>', priority: 'high', dueDate: '2026-07-01' },
    });
    expect(r.subject).toBe('You were assigned to "Ship the thing"');
    expect(r.html).toContain('Title');
    expect(r.html).toContain('Ship the thing');
    expect(r.html).toContain('High');             // priority label
    expect(r.html).toContain('2026-07-01');       // due date
    expect(r.html).toContain('Do the work');      // description flattened from HTML
    expect(r.html).toContain('Open in Romega Portal');
    // Exactly one CTA anchor.
    expect((r.html.match(/Open in Romega Portal/g) ?? []).length).toBe(1);
    // Absolute deep link (never localhost).
    expect(r.html).toContain('https://portal.romega-solutions.com/projects/3?task=42');
    expect(r.text).toContain('Priority: High');
    expect(r.text).toContain('Open in Romega Portal: https://portal.romega-solutions.com/projects/3?task=42');
  });

  it('builds a non-task email (no task box) from title/body/link', () => {
    const r = renderNotificationEmail({
      title: 'You have been added to Apollo',
      body: 'Ken added you to this project.',
      link: '/projects/7',
    });
    expect(r.html).not.toContain('Priority');
    expect(r.html).toContain('Open in Romega Portal');
    expect(r.html).toContain('https://portal.romega-solutions.com/projects/7');
  });

  it('escapes hostile task content (no raw markup injection)', () => {
    const r = renderNotificationEmail({
      title: '<script>alert(1)</script>',
      link: '/projects/1?task=1',
      task: { title: '<img src=x onerror=alert(1)>', priority: 'none', dueDate: null },
    });
    expect(r.html).not.toContain('<script>alert(1)</script>');
    expect(r.html).not.toContain('<img src=x');
    expect(r.html).toContain('No due date');
  });
});
