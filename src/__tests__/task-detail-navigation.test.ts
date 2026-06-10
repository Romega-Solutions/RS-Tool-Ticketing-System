import { describe, expect, it } from 'vitest';
import {
  appendTaskDetailCrumb,
  popTaskDetailCrumb,
  taskDetailCrumbLabel,
  type TaskDetailCrumb,
} from '@/lib/task-detail-navigation';

describe('task detail navigation helpers', () => {
  const parent: TaskDetailCrumb = { id: '9', sequenceId: 9, name: 'Parent task' };
  const child: TaskDetailCrumb = { id: '10', sequenceId: 10, name: 'Child task' };

  it('adds parent crumbs once as users drill into sub-issues', () => {
    expect(appendTaskDetailCrumb([], parent)).toEqual([parent]);
    expect(appendTaskDetailCrumb([parent], parent)).toEqual([parent]);
    expect(appendTaskDetailCrumb([parent], child)).toEqual([parent, child]);
  });

  it('pops back to the previous task while preserving the remaining trail', () => {
    expect(popTaskDetailCrumb([parent, child])).toEqual({
      previous: child,
      trail: [parent],
    });
    expect(popTaskDetailCrumb([])).toEqual({ previous: null, trail: [] });
  });

  it('formats task crumbs with the visible shortcut number', () => {
    expect(taskDetailCrumbLabel(child)).toBe('#10 Child task');
  });
});
