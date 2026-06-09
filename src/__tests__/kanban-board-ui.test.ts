import { describe, expect, it } from 'vitest';
import {
  getKanbanDragAnnouncement,
  getKanbanDragHandleLabel,
  getKanbanTaskAriaLabel,
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
