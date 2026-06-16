'use client';

import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  type Announcements,
  type CollisionDetection,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragOverEvent,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { AlertTriangle, GripVertical, Plus, Loader2, X } from 'lucide-react';
import { TaskDetailSheet, type SheetWorkItem } from '@/components/task-detail-sheet';
import {
  getKanbanDragAnnouncement,
  getKanbanDragHandleLabel,
  getKanbanTaskAriaLabel,
  type KanbanTaskDescriptor,
} from '@/lib/kanban-board-ui';

// ── Types ──────────────────────────────────────────────────────────────────────

export type KanbanState = {
  id: string;
  name: string;
  group: string;
  color: string;
  sequence: number;
};

export type KanbanItem = {
  id: string;
  sequence_id: number;
  name: string;
  priority: string;
  assignees: string[];
  target_date?: string | null;
  label_ids?: number[];
  cycle_id?: number | null;
  state_detail?: { id: string; name: string; group: string; color: string };
};

type KanbanCycle = { id: number; name: string; start_date: string; end_date: string };
type KanbanLabel = { id: number; name: string; color: string };
type KanbanMember = { id: number; user_id: number; name: string; email: string; role: string };

// ── Priority dot ───────────────────────────────────────────────────────────────

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500',
  high:   'bg-orange-400',
  medium: 'bg-yellow-400',
  low:    'bg-green-400',
  none:   'bg-slate-300',
};

const kanbanCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (args.pointerCoordinates) return pointerCollisions;
  return closestCenter(args);
};

function toTaskDescriptor(item: KanbanItem | null): KanbanTaskDescriptor | null {
  return item
    ? { id: item.id, sequenceId: item.sequence_id, name: item.name }
    : null;
}

// ── Card (used in column + drag overlay) ──────────────────────────────────────

function CardContent({
  item,
  overlay = false,
  onOpen,
  dragHandle,
  isActive = false,
}: {
  item: KanbanItem;
  overlay?: boolean;
  onOpen?: () => void;
  dragHandle?: React.ReactNode;
  isActive?: boolean;
}) {
  const isOverdue =
    item.target_date &&
    item.state_detail?.group !== 'completed' &&
    new Date(item.target_date + 'T00:00:00') < new Date();
  const task = toTaskDescriptor(item)!;

  const titleContent = (
    <>
      <span className="text-[11px] text-(--rs-neutral-grey-400) font-mono">#{item.sequence_id}</span>
      <p className="mt-1 text-sm font-medium text-(--rs-neutral-grey-900) leading-snug line-clamp-2">
        {item.name}
      </p>
    </>
  );

  return (
    <div
      className={`min-h-28 rounded-lg border bg-white p-3 space-y-2 select-none transition-[background-color,border-color,box-shadow,transform,opacity] duration-150 ${
        overlay
          ? 'w-[min(18rem,82vw)] cursor-grabbing border-(--rs-primary-400) shadow-xl'
          : isActive
            ? 'border-(--rs-primary-300) bg-(--rs-primary-50) opacity-50 ring-2 ring-(--rs-primary-100)'
            : 'border-(--rs-neutral-grey-200) hover:border-(--rs-primary-200) hover:shadow-sm motion-safe:hover:-translate-y-0.5'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        {overlay ? (
          <div className="min-w-0 flex-1 text-left">{titleContent}</div>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-300) focus-visible:ring-offset-2"
            aria-label={getKanbanTaskAriaLabel(task)}
          >
            {titleContent}
          </button>
        )}
        <div
          className={`mt-1 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[item.priority] ?? PRIORITY_DOT.none}`}
          title={item.priority ?? 'none'}
        />
        {dragHandle}
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        {item.target_date && (
          <span className={`inline-flex items-center gap-1 text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-(--rs-neutral-grey-400)'}`}>
            {isOverdue && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
            {new Date(item.target_date + 'T00:00:00').toLocaleDateString('en-US', {
              month: 'short', day: 'numeric',
            })}
          </span>
        )}
        {item.assignees?.length > 0 && (
          <div className="flex -space-x-1 ml-auto">
            {item.assignees.slice(0, 3).map(id => (
              <div
                key={id}
                className="w-5 h-5 rounded-full bg-(--rs-primary-200) text-(--rs-primary-800) flex items-center justify-center text-[9px] font-bold border border-white"
                title={id}
              >
                {id.slice(-2).toUpperCase()}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Draggable card wrapper ─────────────────────────────────────────────────────

function DraggableCard({ item, isActive, onOpen }: { item: KanbanItem; isActive: boolean; onOpen: (id: string) => void }) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef } = useDraggable({
    id: item.id,
    attributes: {
      roleDescription: 'task move handle',
    },
  });
  const task = toTaskDescriptor(item)!;

  return (
    <div
      ref={setNodeRef}
      style={{ transition: 'opacity 150ms', touchAction: 'manipulation' }}
    >
      <CardContent
        item={item}
        isActive={isActive}
        onOpen={() => onOpen(item.id)}
        dragHandle={
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            aria-label={getKanbanDragHandleLabel(task)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-(--rs-neutral-grey-400) transition-colors hover:bg-(--rs-neutral-grey-50) hover:text-(--rs-primary-700) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-300) focus-visible:ring-offset-2"
            style={{ touchAction: 'none' }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </button>
        }
      />
    </div>
  );
}

// ── Inline add-task form ───────────────────────────────────────────────────────

function AddTaskForm({
  stateId,
  projectId,
  onAdd,
}: {
  stateId: string;
  projectId: string;
  onAdd: (stateId: string, item: KanbanItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const openForm = () => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 40);
  };

  const close = () => { setOpen(false); setValue(''); setError(''); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/tickets/work-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, name: value.trim(), state: stateId, priority: 'none' }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Failed to create task');
        return;
      }
      const created = (await res.json()) as KanbanItem;
      onAdd(stateId, created);
      close();
    } catch {
      setError('Request failed');
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={openForm}
        className="flex min-h-10 w-full items-center gap-1.5 rounded-md px-2 py-2 text-xs text-(--rs-neutral-grey-400) transition-colors hover:bg-(--rs-neutral-grey-50) hover:text-(--rs-neutral-grey-700)"
      >
        <Plus className="w-3.5 h-3.5" /> Add task
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 pt-1">
      <input
        ref={inputRef}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => e.key === 'Escape' && close()}
        placeholder="Task title…"
        className="w-full text-sm px-2.5 py-1.5 border border-(--rs-primary-300) rounded-md outline-none focus:ring-2 focus:ring-offset-0 bg-white"
        style={{ boxShadow: 'none' }}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="flex min-h-9 items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-50"
          style={{ background: 'var(--rs-primary-500)' }}
        >
          {loading && <Loader2 className="w-3 h-3 animate-spin" />}
          Add
        </button>
        <button
          type="button"
          onClick={close}
          className="min-h-9 rounded-md px-2.5 py-1 text-xs text-(--rs-neutral-grey-500) transition-colors hover:bg-(--rs-neutral-grey-50) hover:text-(--rs-neutral-grey-800)"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Droppable column ───────────────────────────────────────────────────────────

function KanbanColumn({
  state,
  items,
  activeId,
  projectId,
  onAdd,
  onOpen,
}: {
  state: KanbanState;
  items: KanbanItem[];
  activeId: string | null;
  projectId: string;
  onAdd: (stateId: string, item: KanbanItem) => void;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: state.id });

  return (
    <div
      ref={setNodeRef}
      className="flex w-[82vw] max-w-[18rem] shrink-0 snap-start flex-col overflow-hidden rounded-lg border bg-white transition-[border-color,box-shadow] duration-150 sm:w-72 sm:max-w-none"
      style={{
        borderColor: isOver ? 'var(--rs-primary-300)' : 'var(--rs-neutral-grey-200)',
        boxShadow: isOver ? '0 0 0 3px var(--rs-primary-100)' : 'none',
      }}
    >
      {/* Header */}
      <div
        className="flex min-h-11 items-center gap-2 px-3 py-2 font-semibold text-sm text-white"
        style={{ backgroundColor: state.color || '#64748b' }}
      >
        <span className="flex-1 truncate">{state.name}</span>
        <span className="bg-white/25 rounded-full px-1.5 py-0.5 text-xs font-bold shrink-0 leading-none">
          {items.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        className="flex min-h-40 flex-1 flex-col transition-colors"
        style={{
          backgroundColor: isOver ? 'var(--rs-primary-50)' : 'var(--rs-neutral-grey-50)',
          padding: '8px',
        }}
      >
        {isOver && activeId && (
          <div className="mb-2 flex min-h-10 items-center justify-center rounded-md border border-(--rs-primary-200) bg-white px-3 text-xs font-medium text-(--rs-primary-700)">
            Release to move here
          </div>
        )}
        <div className="min-h-24 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-0.5 sm:max-h-[calc(100dvh-17rem)]">
          {items.map(item => (
            <DraggableCard
              key={item.id}
              item={item}
              isActive={activeId === item.id}
              onOpen={onOpen}
            />
          ))}
          {items.length === 0 && (
            <div className={`flex h-20 items-center justify-center rounded-md border-2 border-dashed transition-colors ${
              isOver
                ? 'border-(--rs-primary-300) bg-white text-(--rs-primary-700)'
                : 'border-(--rs-neutral-grey-200) text-(--rs-neutral-grey-300)'
            }`}>
              <span className="text-xs">{isOver ? 'Release here' : 'No tasks'}</span>
            </div>
          )}
        </div>

        {/* Add task */}
        <div className="mt-2 border-t border-(--rs-neutral-grey-200) pt-2">
          <AddTaskForm stateId={state.id} projectId={projectId} onAdd={onAdd} />
        </div>
      </div>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export function KanbanBoard({
  states,
  initialItems,
  projectId,
  currentUserId,
  isAdmin,
  cycles = [],
}: {
  states: KanbanState[];
  initialItems: KanbanItem[];
  projectId: string;
  currentUserId: number;
  isAdmin: boolean;
  cycles?: KanbanCycle[];
}) {
  // Build state → items map from initial server data
  const [itemsByState, setItemsByState] = useState<Map<string, KanbanItem[]>>(() => {
    const map = new Map<string, KanbanItem[]>(states.map(s => [s.id, []]));
    for (const item of initialItems) {
      const sid = item.state_detail?.id ?? '';
      if (map.has(sid)) {
        map.get(sid)!.push(item);
      } else {
        // Fallback: match by group name
        const fallback = states.find(
          s => s.group.toLowerCase() === (item.state_detail?.group ?? '').toLowerCase(),
        );
        if (fallback) map.get(fallback.id)!.push(item);
      }
    }
    return map;
  });

  const [activeItem, setActiveItem] = useState<KanbanItem | null>(null);
  const [dragError, setDragError] = useState('');
  const [moveNotice, setMoveNotice] = useState<{ tone: 'info' | 'success'; message: string } | null>(null);
  const [movingItemId, setMovingItemId] = useState<string | null>(null);
  const [openItemId, setOpenItemId] = useState<string | null>(null);

  // ── Filter state (URL-synced via window.location, optional for SSR safety) ──
  const [filters, setFilters] = useState<{
    assignee: string;
    label: string;
    priority: string;
    cycle: string;
    dueSoon: boolean;
    mine: boolean;
  }>(() => {
    if (typeof window === 'undefined') return { assignee: '', label: '', priority: '', cycle: '', dueSoon: false, mine: false };
    const sp = new URLSearchParams(window.location.search);
    return {
      assignee: sp.get('assignee') ?? '',
      label:    sp.get('label')    ?? '',
      priority: sp.get('priority') ?? '',
      cycle:    sp.get('cycle')    ?? '',
      dueSoon:  sp.get('dueSoon')  === '1',
      mine:     sp.get('mine')     === '1',
    };
  });

  // Push filter state back to URL (no full navigation).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams();
    if (filters.assignee) sp.set('assignee', filters.assignee);
    if (filters.label)    sp.set('label',    filters.label);
    if (filters.priority) sp.set('priority', filters.priority);
    if (filters.cycle)    sp.set('cycle',    filters.cycle);
    if (filters.dueSoon)  sp.set('dueSoon', '1');
    if (filters.mine)     sp.set('mine',    '1');
    const qs = sp.toString();
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', next);
  }, [filters]);

  const [labels, setLabels]   = useState<KanbanLabel[]>([]);
  const [members, setMembers] = useState<KanbanMember[]>([]);

  useEffect(() => {
    fetch(`/api/tickets/projects/${projectId}/labels`)
      .then(r => r.ok ? r.json() : []).then(setLabels).catch(() => {});
    fetch(`/api/tickets/projects/${projectId}/members`)
      .then(r => r.ok ? r.json() : []).then(setMembers).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    if (moveNotice?.tone !== 'success') return;
    const timeout = window.setTimeout(() => setMoveNotice(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [moveNotice]);

  // Build the lookup keys for the "Mine only" filter — match against either
  // the assignee email (assignees[]) or numeric user id (assignee_ids[]).
  const myKeys = useMemo(() => {
    const me = members.find(m => m.user_id === currentUserId);
    return new Set<string>(me ? [me.email, String(me.user_id)] : [String(currentUserId)]);
  }, [members, currentUserId]);

  const filterMatch = (item: KanbanItem): boolean => {
    if (filters.assignee && !item.assignees.includes(filters.assignee)) return false;
    if (filters.label && !item.label_ids?.includes(Number(filters.label))) return false;
    if (filters.priority && item.priority !== filters.priority) return false;
    if (filters.cycle && String(item.cycle_id ?? '') !== filters.cycle) return false;
    if (filters.dueSoon) {
      if (!item.target_date) return false;
      const d = new Date(item.target_date + 'T00:00:00').getTime();
      const now = new Date().getTime();
      if (d > now + 7 * 24 * 60 * 60 * 1000) return false;
    }
    if (filters.mine) {
      if (!item.assignees.some(a => myKeys.has(a))) return false;
    }
    return true;
  };

  const activeFilterCount =
    Number(!!filters.assignee) + Number(!!filters.label) +
    Number(!!filters.priority) + Number(!!filters.cycle) +
    Number(filters.dueSoon) + Number(filters.mine);

  const clearFilters = () =>
    setFilters({ assignee: '', label: '', priority: '', cycle: '', dueSoon: false, mine: false });

  const findItemAndState = useCallback((itemId: string): [KanbanItem | null, string] => {
    for (const [sid, items] of itemsByState) {
      const found = items.find(i => i.id === itemId);
      if (found) return [found, sid];
    }
    return [null, ''];
  }, [itemsByState]);

  const stateNameById = useMemo(() => new Map(states.map(s => [s.id, s.name])), [states]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const accessibility = useMemo<{ announcements: Announcements; screenReaderInstructions: { draggable: string } }>(() => ({
    announcements: {
      onDragStart: ({ active }) => {
        const [item] = findItemAndState(String(active.id));
        return getKanbanDragAnnouncement({ type: 'start', task: toTaskDescriptor(item) });
      },
      onDragOver: ({ active, over }) => {
        const [item] = findItemAndState(String(active.id));
        return getKanbanDragAnnouncement({
          type: 'over',
          task: toTaskDescriptor(item),
          targetStateName: over ? stateNameById.get(String(over.id)) : null,
        });
      },
      onDragEnd: ({ active, over }) => {
        const [item] = findItemAndState(String(active.id));
        return getKanbanDragAnnouncement({
          type: 'end',
          task: toTaskDescriptor(item),
          targetStateName: over ? stateNameById.get(String(over.id)) : null,
        });
      },
      onDragCancel: ({ active }) => {
        const [item] = findItemAndState(String(active.id));
        return getKanbanDragAnnouncement({ type: 'cancel', task: toTaskDescriptor(item) });
      },
    },
    screenReaderInstructions: {
      draggable: 'Press Enter or Space on a task move handle to pick it up. Use arrow keys to move between columns. Press Enter or Space again to drop it, or Escape to cancel.',
    },
  }), [findItemAndState, stateNameById]);

  const handleDragStart = ({ active }: DragStartEvent) => {
    const [item] = findItemAndState(active.id as string);
    setActiveItem(item);
    setDragError('');
    setMoveNotice(null);
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    const [item] = findItemAndState(active.id as string);
    const targetName = over ? stateNameById.get(String(over.id)) : null;
    if (!item || !targetName) return;
    setMoveNotice({
      tone: 'info',
      message: getKanbanDragAnnouncement({
        type: 'over',
        task: toTaskDescriptor(item),
        targetStateName: targetName,
      }) ?? '',
    });
  };

  const handleDragCancel = () => {
    setActiveItem(null);
    setMoveNotice(null);
  };

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    setActiveItem(null);
    if (!over) {
      setMoveNotice(null);
      return;
    }

    const draggedId = active.id as string;
    const targetStateId = over.id as string;
    const [draggedItem, sourceStateId] = findItemAndState(draggedId);

    if (!draggedItem || sourceStateId === targetStateId) {
      setMoveNotice(null);
      return;
    }

    // Snapshot for revert
    const snapshot = new Map(
      [...itemsByState.entries()].map(([k, v]) => [k, [...v]]),
    );

    // Build updated item with new state_detail
    const targetState = states.find(s => s.id === targetStateId);
    const taskDescriptor = toTaskDescriptor(draggedItem);
    const updatedItem: KanbanItem = {
      ...draggedItem,
      state_detail: targetState
        ? { id: targetState.id, name: targetState.name, group: targetState.group, color: targetState.color }
        : draggedItem.state_detail,
    };

    // Optimistic update
    setItemsByState(prev => {
      const next = new Map(prev);
      next.set(sourceStateId, (next.get(sourceStateId) ?? []).filter(i => i.id !== draggedId));
      next.set(targetStateId, [...(next.get(targetStateId) ?? []), updatedItem]);
      return next;
    });
    setMovingItemId(draggedId);
    setMoveNotice({
      tone: 'info',
      message: targetState
        ? `Saving move to ${targetState.name}...`
        : 'Saving move...',
    });

    let res: Response;
    try {
      res = await fetch('/api/tickets/work-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, itemId: draggedId, state: targetStateId }),
      });
    } catch {
      setItemsByState(snapshot);
      setDragError('Request failed. Please try again.');
      setMoveNotice(null);
      setMovingItemId(null);
      return;
    }

    if (!res.ok) {
      setItemsByState(snapshot);
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setDragError(data.error ?? 'Failed to move task. Please try again.');
      setMoveNotice(null);
      setMovingItemId(null);
      return;
    }
    setMoveNotice({
      tone: 'success',
      message: getKanbanDragAnnouncement({
        type: 'end',
        task: taskDescriptor,
        targetStateName: targetState?.name,
      }) ?? 'Task moved.',
    });
    setMovingItemId(null);
  };

  const handleTaskAdded = (stateId: string, item: KanbanItem) => {
    setItemsByState(prev => {
      const next = new Map(prev);
      next.set(stateId, [...(next.get(stateId) ?? []), item]);
      return next;
    });
  };

  return (
    <div className="max-w-full overflow-hidden" role="region" aria-label="Project Kanban board">
      {/* Filter bar */}
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0">
        <select
          aria-label="Filter tasks by assignee"
          value={filters.assignee}
          onChange={e => setFilters(f => ({ ...f, assignee: e.target.value }))}
          className="min-h-10 min-w-36 flex-none rounded-md border border-(--rs-neutral-grey-200) bg-white px-2.5 py-2 text-xs"
        >
          <option value="">All assignees</option>
          {members.map(m => (
            <option key={m.user_id} value={m.email}>{m.name}</option>
          ))}
        </select>

        <select
          aria-label="Filter tasks by label"
          value={filters.label}
          onChange={e => setFilters(f => ({ ...f, label: e.target.value }))}
          className="min-h-10 min-w-32 flex-none rounded-md border border-(--rs-neutral-grey-200) bg-white px-2.5 py-2 text-xs"
        >
          <option value="">All labels</option>
          {labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>

        <select
          aria-label="Filter tasks by priority"
          value={filters.priority}
          onChange={e => setFilters(f => ({ ...f, priority: e.target.value }))}
          className="min-h-10 min-w-32 flex-none rounded-md border border-(--rs-neutral-grey-200) bg-white px-2.5 py-2 text-xs"
        >
          <option value="">Any priority</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="none">None</option>
        </select>

        {cycles.length > 0 && (
          <select
            aria-label="Filter tasks by cycle"
            value={filters.cycle}
            onChange={e => setFilters(f => ({ ...f, cycle: e.target.value }))}
            className="min-h-10 min-w-32 flex-none rounded-md border border-(--rs-neutral-grey-200) bg-white px-2.5 py-2 text-xs"
          >
            <option value="">All cycles</option>
            {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}

        <Toggle
          on={filters.dueSoon}
          label="Due soon"
          onChange={v => setFilters(f => ({ ...f, dueSoon: v }))}
        />
        <Toggle
          on={filters.mine}
          label="Mine only"
          onChange={v => setFilters(f => ({ ...f, mine: v }))}
        />

        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            aria-label={`Clear ${activeFilterCount} active task filter${activeFilterCount === 1 ? '' : 's'}`}
            className="ml-1 flex min-h-10 flex-none items-center gap-1 rounded-md px-2 text-xs text-(--rs-neutral-grey-500) hover:bg-(--rs-neutral-grey-50) hover:text-(--rs-neutral-grey-800)"
          >
            <X className="w-3 h-3" /> Clear ({activeFilterCount})
          </button>
        )}
      </div>

      {moveNotice && (
        <div
          role="status"
          aria-live="polite"
          className={`mb-3 flex min-h-10 items-center rounded-lg border px-3 text-sm ${
            moveNotice.tone === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-(--rs-primary-200) bg-(--rs-primary-50) text-(--rs-primary-800)'
          }`}
        >
          {moveNotice.message}
        </div>
      )}

      {dragError && (
        <div role="alert" className="mb-4 px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-center justify-between gap-2">
          <span>{dragError}</span>
          <button
            onClick={() => setDragError('')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-red-400 hover:bg-red-100 hover:text-red-600"
            aria-label="Dismiss move error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <DndContext
        // Stable id so dnd-kit's accessibility node ids (aria-describedby) are
        // deterministic across SSR + client hydration instead of an incrementing
        // counter, which otherwise causes a hydration mismatch warning.
        id="kanban-board"
        sensors={sensors}
        accessibility={accessibility}
        collisionDetection={kanbanCollisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="-mx-4 overflow-x-auto overscroll-x-contain px-4 pb-2 sm:-mx-1 sm:px-1">
          <div className="flex min-w-max snap-x snap-mandatory items-start gap-4 pb-4">
            {states.map(state => (
              <KanbanColumn
                key={state.id}
                state={state}
                items={(itemsByState.get(state.id) ?? []).filter(filterMatch)}
                activeId={activeItem?.id ?? movingItemId}
                projectId={projectId}
                onAdd={handleTaskAdded}
                onOpen={setOpenItemId}
              />
            ))}
          </div>
        </div>

        <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
          {activeItem ? <CardContent item={activeItem} overlay /> : null}
        </DragOverlay>
      </DndContext>

      <TaskDetailSheet
        itemId={openItemId}
        open={openItemId !== null}
        onOpenChange={(o) => !o && setOpenItemId(null)}
        states={states.map(s => ({ id: s.id, name: s.name, color: s.color }))}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        onSaved={(updated) => applySheetUpdate(updated)}
        onArchived={(id) => removeItemFromBoard(id)}
      />
    </div>
  );

  function applySheetUpdate(updated: SheetWorkItem) {
    // Re-locate the item, possibly into a new column if the state changed.
    setItemsByState(prev => {
      const next = new Map(prev);
      let sourceStateId = '';
      for (const [sid, list] of next) {
        if (list.some(i => i.id === updated.id)) { sourceStateId = sid; break; }
      }
      if (sourceStateId) {
        next.set(sourceStateId, (next.get(sourceStateId) ?? []).filter(i => i.id !== updated.id));
      }
      const targetState = states.find(s => s.id === updated.state) ?? states.find(s => s.id === sourceStateId);
      if (!targetState) return next;
      const merged: KanbanItem = {
        id: updated.id,
        sequence_id: updated.sequence_id,
        name: updated.name,
        priority: updated.priority,
        assignees: updated.assignee_users.map(u => u.email || String(u.id)),
        target_date: updated.target_date,
        state_detail: { id: targetState.id, name: targetState.name, group: targetState.group, color: targetState.color },
      };
      next.set(targetState.id, [...(next.get(targetState.id) ?? []), merged]);
      return next;
    });
  }

  function removeItemFromBoard(id: string) {
    setItemsByState(prev => {
      const next = new Map(prev);
      for (const [sid, list] of next) {
        if (list.some(i => i.id === id)) {
          next.set(sid, list.filter(i => i.id !== id));
          break;
        }
      }
      return next;
    });
  }
}

function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={`min-h-10 flex-none rounded-md border px-3 py-2 text-xs transition-colors ${
        on
          ? 'bg-(--rs-primary-50) border-(--rs-primary-300) text-(--rs-primary-800)'
          : 'bg-white border-(--rs-neutral-grey-200) text-(--rs-neutral-grey-600) hover:border-(--rs-neutral-grey-300)'
      }`}
    >
      {label}
    </button>
  );
}
