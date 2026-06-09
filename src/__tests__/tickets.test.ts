import { describe, it, expect } from 'vitest';
import {
  buildStateLookup,
  describeDashboardActivity,
  enrichWorkItems,
  getStateGroup,
  isActiveGroup,
  isBacklogGroup,
  isCompletedGroup,
  type DashboardActivityEntry,
  type PlaneState,
  type PlaneWorkItem,
} from '@/lib/tickets';

const states: PlaneState[] = [
  { id: 's1', name: 'Todo', group: 'backlog', color: '#aaa', sequence: 0 },
  { id: 's2', name: 'Doing', group: 'started', color: '#bbb', sequence: 1 },
  { id: 's3', name: 'Done', group: 'completed', color: '#ccc', sequence: 2 },
];

describe('buildStateLookup', () => {
  it('maps state id -> state', () => {
    const m = buildStateLookup(states);
    expect(m.get('s2')?.name).toBe('Doing');
    expect(m.size).toBe(3);
  });
});

describe('enrichWorkItems', () => {
  it('fills state_detail from the lookup when missing', () => {
    const items: PlaneWorkItem[] = [{
      id: 'w1', sequence_id: 1, name: 'X', state: 's3',
      priority: 'none', assignees: [], created_at: '', updated_at: '',
    }];
    const out = enrichWorkItems(items, buildStateLookup(states));
    expect(out[0].state_detail?.group).toBe('completed');
  });

  it('leaves an item untouched if state_detail already set', () => {
    const items: PlaneWorkItem[] = [{
      id: 'w1', sequence_id: 1, name: 'X', state: 's1',
      state_detail: { id: 's9', name: 'Custom', group: 'started', color: '#000' },
      priority: 'none', assignees: [], created_at: '', updated_at: '',
    }];
    const out = enrichWorkItems(items, buildStateLookup(states));
    expect(out[0].state_detail?.id).toBe('s9');
  });
});

describe('group predicates', () => {
  it('classifies groups the same as plane.ts did', () => {
    expect(isCompletedGroup('completed')).toBe(true);
    expect(isCompletedGroup('started')).toBe(false);
    expect(isBacklogGroup('backlog')).toBe(true);
    expect(isBacklogGroup('todo')).toBe(true);
    expect(isActiveGroup('started')).toBe(true);
    expect(isActiveGroup('in_progress')).toBe(true);
    // 'unstarted' is intentionally in both predicates (mimics Plane's dual classification)
    expect(isBacklogGroup('unstarted')).toBe(true);
    expect(isActiveGroup('unstarted')).toBe(true);
    expect(getStateGroup({
      id: 'w', sequence_id: 1, name: 'n', state: 's',
      state_detail: { id: 's', name: 'D', group: 'Completed', color: '#0' },
      priority: 'none', assignees: [], created_at: '', updated_at: '',
    })).toBe('completed');
  });
});

describe('describeDashboardActivity', () => {
  const baseActivity: DashboardActivityEntry = {
    id: 1,
    actor_id: 42,
    actor_name: 'Ken Patrick Garcia',
    action: 'created',
    from_value: null,
    to_value: '[Workspace - Projects] Activity Feature',
    created_at: '2026-06-09T08:30:00.000Z',
    work_item_id: 9,
    task_sequence_id: 4,
    task_name: '[Workspace - Projects] Activity Feature',
    project_id: 3,
    project_identifier: 'RS',
    project_name: 'RS Tool Ticketing System',
    from_state_name: null,
    to_state_name: null,
  };

  it('describes a task created activity for the dashboard feed', () => {
    expect(describeDashboardActivity(baseActivity)).toBe(
      'created RS-4 [Workspace - Projects] Activity Feature',
    );
  });

  it('describes a task movement activity with state names', () => {
    expect(describeDashboardActivity({
      ...baseActivity,
      action: 'state_changed',
      from_value: '11',
      to_value: '12',
      from_state_name: 'To Do',
      to_state_name: 'In Progress',
    })).toBe(
      'moved RS-4 [Workspace - Projects] Activity Feature from To Do to In Progress',
    );
  });

  it('falls back to raw state values when state names are unavailable', () => {
    expect(describeDashboardActivity({
      ...baseActivity,
      action: 'state_changed',
      from_value: '11',
      to_value: '12',
    })).toBe(
      'moved RS-4 [Workspace - Projects] Activity Feature from 11 to 12',
    );
  });
});
