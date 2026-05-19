import { describe, it, expect } from 'vitest';
import {
  buildStateLookup,
  enrichWorkItems,
  getStateGroup,
  isActiveGroup,
  isBacklogGroup,
  isCompletedGroup,
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
    expect(getStateGroup({
      id: 'w', sequence_id: 1, name: 'n', state: 's',
      state_detail: { id: 's', name: 'D', group: 'Completed', color: '#0' },
      priority: 'none', assignees: [], created_at: '', updated_at: '',
    })).toBe('completed');
  });
});
