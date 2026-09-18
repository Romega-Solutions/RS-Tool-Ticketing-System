import { describe, expect, it } from 'vitest';
import {
  getKanbanDragAnnouncement,
  getKanbanDragHandleLabel,
  getKanbanTaskAriaLabel,
  sortKanbanItemsBySequence,
} from '@/lib/kanban-board-ui';

const task = {
  id: 'task-1',
  sequenceId: 42,
  name: 'Review onboarding screenshots',
};

describe('kanban board UI helpers', () => {
  it('builds readable task card labels', () => {
    expect(getKanbanTaskAriaLabel(task)).toBe('Open task #42: Review onboarding screenshots');
  });

  it('builds drag handle labels that explain the move target', () => {
    expect(getKanbanDragHandleLabel(task)).toBe('Move task #42: Review onboarding screenshots');
  });

  it('announces drag movement over columns using task and state names', () => {
    expect(getKanbanDragAnnouncement({
      type: 'over',
      task,
      targetStateName: 'In Progress',
    })).toBe('Moving task #42, Review onboarding screenshots, over In Progress.');
  });
});

describe('kanban column sort-by-task-number', () => {
  const items = [
    { sequence_id: 12 },
    { sequence_id: 3 },
    { sequence_id: 27 },
  ];

  it('leaves board order untouched in default mode', () => {
    expect(sortKanbanItemsBySequence(items, 'default')).toBe(items);
  });

  it('sorts ascending by sequence_id in number mode', () => {
    expect(sortKanbanItemsBySequence(items, 'number').map(i => i.sequence_id)).toEqual([3, 12, 27]);
  });

  it('does not mutate the input array', () => {
    const copy = [...items];
    sortKanbanItemsBySequence(items, 'number');
    expect(items).toEqual(copy);
  });
});
