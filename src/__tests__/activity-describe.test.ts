import { describe, it, expect } from 'vitest';
import {
  describeWorkItemActivity, collectActivityRefs, encodeLabelActivity, decodeLabelActivity, formatDay,
  type WorkItemActivityLookups,
} from '@/lib/activity-describe';

const ITEM = { id: 191, sequenceId: 12, name: 'Fix login', projectName: 'Website', projectIdentifier: 'WEB' };
const look = (over: Partial<WorkItemActivityLookups> = {}): WorkItemActivityLookups => ({
  item: ITEM,
  stateName: id => ({ 1: 'In Progress', 2: 'Done' } as Record<number, string>)[id] ?? null,
  userName: id => ({ 7: 'Jane Cruz' } as Record<number, string>)[id] ?? null,
  cycleName: id => ({ 4: 'Sprint 4', 5: 'Sprint 5' } as Record<number, string>)[id] ?? null,
  itemName: id => ({ 50: 'Auth epic' } as Record<number, string>)[id] ?? null,
  ...over,
});
const row = (action: string, from_value: string | null = null, to_value: string | null = null) => ({ action, from_value, to_value });

describe('describeWorkItemActivity', () => {
  it('names the work item and project on every entry', () => {
    const d = describeWorkItemActivity(row('archived'), look());
    expect(d).toEqual({ description: 'Archived "Fix login" in Website', workItem: 'WEB-12 Fix login', project: 'Website', changes: [] });
  });

  it('describes a created item', () => {
    expect(describeWorkItemActivity(row('created', null, 'Fix login'), look()).description).toBe('Created "Fix login" in Website');
    expect(describeWorkItemActivity(row('created', null, 'Old title'), look({ item: null })).description).toBe('Created "Old title"');
  });

  it('shows the new state and the old → new transition', () => {
    const d = describeWorkItemActivity(row('state_changed', '1', '2'), look());
    expect(d.description).toBe('Moved "Fix login" to Done in Website');
    expect(d.changes).toEqual([{ field: 'state', label: 'State', from: 'In Progress', to: 'Done' }]);
  });

  it('falls back when a state no longer exists', () => {
    const d = describeWorkItemActivity(row('state_changed', null, '99'), look());
    expect(d.description).toBe('Moved "Fix login" to a new state in Website');
    expect(d.changes).toEqual([{ field: 'state', label: 'State', from: null, to: null }]);
  });

  it('names who was assigned or unassigned', () => {
    expect(describeWorkItemActivity(row('assigned', null, '7'), look())).toMatchObject({
      description: 'Assigned Jane Cruz to "Fix login" in Website',
      changes: [{ field: 'assignee', label: 'Assignee added', value: 'Jane Cruz' }],
    });
    expect(describeWorkItemActivity(row('unassigned', '8', null), look()).description)
      .toBe('Unassigned a former member from "Fix login" in Website');
  });

  it('shows the comment excerpt (first 80 characters)', () => {
    const text = 'x'.repeat(100);
    const d = describeWorkItemActivity(row('commented', null, text), look());
    expect(d.description).toBe('Commented on "Fix login" in Website');
    expect(d.changes).toEqual([{ field: 'comment', label: 'Comment', from: null, to: null, value: 'x'.repeat(80) }]);
  });

  it('shows the link title and URL as plain values', () => {
    const d = describeWorkItemActivity(row('link_added', null, JSON.stringify({ title: 'PR', url: 'https://github.com/o/r/pull/1' })), look());
    expect(d.description).toBe('Added the link "PR" to "Fix login" in Website');
    expect(d.changes).toEqual([
      { field: 'linkTitle', label: 'Link title', from: null, to: null, value: 'PR' },
      { field: 'linkUrl', label: 'Link URL', from: null, to: null, value: 'https://github.com/o/r/pull/1' },
    ]);
    const removed = describeWorkItemActivity(row('link_removed', JSON.stringify({ title: '', url: 'https://x.com/a' }), null), look());
    expect(removed.description).toBe('Removed a link from "Fix login" in Website');
    expect(removed.changes).toEqual([{ field: 'linkUrl', label: 'Link URL', from: null, to: null, value: 'https://x.com/a' }]);
  });

  it('describes priority, name, due date, cycle and parent edits old → new', () => {
    expect(describeWorkItemActivity(row('edited', 'priority:medium', 'priority:high'), look())).toMatchObject({
      description: 'Changed the priority of "Fix login" to High in Website',
      changes: [{ field: 'priority', label: 'Priority', from: 'Medium', to: 'High' }],
    });
    expect(describeWorkItemActivity(row('edited', 'name:Old: title', 'name:Fix login'), look())).toMatchObject({
      description: 'Renamed "Old: title" to "Fix login" in Website',
      changes: [{ field: 'name', from: 'Old: title', to: 'Fix login' }],
    });
    expect(describeWorkItemActivity(row('edited', 'target_date:', 'target_date:2026-11-03'), look())).toMatchObject({
      description: 'Set the due date of "Fix login" to Nov 3, 2026 in Website',
      changes: [{ field: 'dueDate', label: 'Due date', from: null, to: 'Nov 3, 2026' }],
    });
    expect(describeWorkItemActivity(row('edited', 'target_date:2026-11-03', 'target_date:'), look()).description)
      .toBe('Cleared the due date of "Fix login" in Website');
    expect(describeWorkItemActivity(row('edited', 'cycle:4', 'cycle:'), look()).changes)
      .toEqual([{ field: 'cycle', label: 'Cycle', from: 'Sprint 4', to: null }]);
    expect(describeWorkItemActivity(row('edited', 'parent:', 'parent:50'), look())).toMatchObject({
      description: 'Set the parent of "Fix login" to "Auth epic" in Website',
      changes: [{ field: 'parent', from: null, to: 'Auth epic' }],
    });
  });

  it('only says the description changed', () => {
    expect(describeWorkItemActivity(row('edited', 'description', 'description'), look())).toMatchObject({
      description: 'Changed the description of "Fix login" in Website',
      changes: [{ field: 'description', label: 'Description', from: null, to: null, hidden: 'value' }],
    });
  });

  it('names a label when the row stored it, and stays generic for older rows', () => {
    expect(describeWorkItemActivity(row('edited', 'label', '+3:Bug'), look())).toMatchObject({
      description: 'Added the label "Bug" to "Fix login" in Website',
      changes: [{ field: 'label', label: 'Label added', value: 'Bug' }],
    });
    expect(describeWorkItemActivity(row('edited', 'label', '-3'), look())).toMatchObject({
      description: 'Removed a label from "Fix login" in Website', changes: [],
    });
  });

  it('copes with a missing work item', () => {
    expect(describeWorkItemActivity(row('archived'), look({ item: null })))
      .toEqual({ description: 'Archived a work item', workItem: null, project: null, changes: [] });
  });
});

describe('collectActivityRefs', () => {
  it('collects state, cycle and parent ids once each', () => {
    expect(collectActivityRefs([
      row('state_changed', '1', '2'), row('state_changed', '2', '3'),
      row('edited', 'cycle:4', 'cycle:5'), row('edited', 'parent:', 'parent:50'),
      row('edited', 'priority:low', 'priority:high'), row('assigned', null, '7'),
    ])).toEqual({ stateIds: [1, 2, 3], cycleIds: [4, 5], itemIds: [50] });
  });
});

describe('label activity encoding', () => {
  it('stores the label name after the id, and reads old id-only rows', () => {
    expect(encodeLabelActivity('+', 3, 'Bug')).toBe('+3:Bug');
    expect(encodeLabelActivity('-', 3, null)).toBe('-3');
    expect(decodeLabelActivity('+3:Needs: review')).toEqual({ added: true, labelId: 3, name: 'Needs: review' });
    expect(decodeLabelActivity('-3')).toEqual({ added: false, labelId: 3, name: null });
    expect(decodeLabelActivity('label')).toBeNull();
  });
});

describe('formatDay', () => {
  it('formats a calendar day without shifting it', () => {
    expect(formatDay('2026-01-01')).toBe('Jan 1, 2026');
    expect(formatDay('garbage')).toBe('garbage');
  });
});
