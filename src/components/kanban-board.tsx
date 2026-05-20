'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Plus, Loader2, X } from 'lucide-react';
import { TaskDetailSheet, type SheetWorkItem } from '@/components/task-detail-sheet';

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

// ── Card (used in column + drag overlay) ──────────────────────────────────────

function CardContent({ item, overlay = false, onClick }: { item: KanbanItem; overlay?: boolean; onClick?: () => void }) {
  const isOverdue =
    item.target_date &&
    item.state_detail?.group !== 'completed' &&
    new Date(item.target_date + 'T00:00:00') < new Date();

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg border p-3 space-y-2 select-none ${
        overlay
          ? 'border-(--rs-primary-400) shadow-xl rotate-1 cursor-grabbing w-64'
          : 'border-(--rs-neutral-grey-200) hover:border-(--rs-primary-200) cursor-grab hover:shadow-sm transition-all'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] text-(--rs-neutral-grey-400) font-mono">#{item.sequence_id}</span>
        <div
          className={`w-2 h-2 rounded-full mt-0.5 shrink-0 ${PRIORITY_DOT[item.priority] ?? PRIORITY_DOT.none}`}
          title={item.priority ?? 'none'}
        />
      </div>

      <p className="text-sm font-medium text-(--rs-neutral-grey-900) leading-snug line-clamp-2">
        {item.name}
      </p>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        {item.target_date && (
          <span className={`text-xs ${isOverdue ? 'text-red-500 font-medium' : 'text-(--rs-neutral-grey-400)'}`}>
            {isOverdue ? '⚠ ' : ''}
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
  const { attributes, listeners, setNodeRef } = useDraggable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ opacity: isActive ? 0.3 : 1, transition: 'opacity 150ms' }}
    >
      <CardContent item={item} onClick={() => onOpen(item.id)} />
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
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-(--rs-neutral-grey-400) hover:text-(--rs-neutral-grey-700) hover:bg-(--rs-neutral-grey-50) rounded-md transition-colors"
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
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md font-medium text-white disabled:opacity-50 transition-opacity"
          style={{ background: 'var(--rs-primary-500)' }}
        >
          {loading && <Loader2 className="w-3 h-3 animate-spin" />}
          Add
        </button>
        <button
          type="button"
          onClick={close}
          className="text-xs px-2.5 py-1 text-(--rs-neutral-grey-500) hover:text-(--rs-neutral-grey-800) transition-colors"
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
    <div className="shrink-0 w-64 flex flex-col">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-lg font-semibold text-sm text-white"
        style={{ backgroundColor: state.color || '#64748b' }}
      >
        <span className="flex-1 truncate">{state.name}</span>
        <span className="bg-white/25 rounded-full px-1.5 py-0.5 text-xs font-bold shrink-0 leading-none">
          {items.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className="flex-1 min-h-28 rounded-b-lg border border-t-0 transition-colors"
        style={{
          borderColor: isOver ? 'var(--rs-primary-300)' : 'var(--rs-neutral-grey-200)',
          backgroundColor: isOver ? 'var(--rs-primary-50)' : 'var(--rs-neutral-grey-50)',
          padding: '8px',
        }}
      >
        <div className="space-y-2">
          {items.map(item => (
            <DraggableCard
              key={item.id}
              item={item}
              isActive={activeId === item.id}
              onOpen={onOpen}
            />
          ))}
          {items.length === 0 && !isOver && (
            <div className="h-14 rounded-md border-2 border-dashed border-(--rs-neutral-grey-200) flex items-center justify-center">
              <span className="text-xs text-(--rs-neutral-grey-300)">Drop here</span>
            </div>
          )}
        </div>

        {/* Add task */}
        <div className="mt-2">
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
      const now = Date.now();
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const findItemAndState = (itemId: string): [KanbanItem | null, string] => {
    for (const [sid, items] of itemsByState) {
      const found = items.find(i => i.id === itemId);
      if (found) return [found, sid];
    }
    return [null, ''];
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    const [item] = findItemAndState(active.id as string);
    setActiveItem(item);
    setDragError('');
  };

  const handleDragEnd = async ({ active, over }: DragEndEvent) => {
    setActiveItem(null);
    if (!over) return;

    const draggedId = active.id as string;
    const targetStateId = over.id as string;
    const [draggedItem, sourceStateId] = findItemAndState(draggedId);

    if (!draggedItem || sourceStateId === targetStateId) return;

    // Snapshot for revert
    const snapshot = new Map(
      [...itemsByState.entries()].map(([k, v]) => [k, [...v]]),
    );

    // Build updated item with new state_detail
    const targetState = states.find(s => s.id === targetStateId);
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

    // API call
    const res = await fetch('/api/tickets/work-items', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, itemId: draggedId, state: targetStateId }),
    });

    if (!res.ok) {
      setItemsByState(snapshot);
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setDragError(data.error ?? 'Failed to move task. Please try again.');
    }
  };

  const handleTaskAdded = (stateId: string, item: KanbanItem) => {
    setItemsByState(prev => {
      const next = new Map(prev);
      next.set(stateId, [...(next.get(stateId) ?? []), item]);
      return next;
    });
  };

  return (
    <div>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select
          value={filters.assignee}
          onChange={e => setFilters(f => ({ ...f, assignee: e.target.value }))}
          className="text-xs px-2.5 py-1.5 border border-(--rs-neutral-grey-200) rounded-md bg-white"
        >
          <option value="">All assignees</option>
          {members.map(m => (
            <option key={m.user_id} value={m.email}>{m.name}</option>
          ))}
        </select>

        <select
          value={filters.label}
          onChange={e => setFilters(f => ({ ...f, label: e.target.value }))}
          className="text-xs px-2.5 py-1.5 border border-(--rs-neutral-grey-200) rounded-md bg-white"
        >
          <option value="">All labels</option>
          {labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>

        <select
          value={filters.priority}
          onChange={e => setFilters(f => ({ ...f, priority: e.target.value }))}
          className="text-xs px-2.5 py-1.5 border border-(--rs-neutral-grey-200) rounded-md bg-white"
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
            value={filters.cycle}
            onChange={e => setFilters(f => ({ ...f, cycle: e.target.value }))}
            className="text-xs px-2.5 py-1.5 border border-(--rs-neutral-grey-200) rounded-md bg-white"
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
            className="ml-1 flex items-center gap-1 text-xs text-(--rs-neutral-grey-500) hover:text-(--rs-neutral-grey-800)"
          >
            <X className="w-3 h-3" /> Clear ({activeFilterCount})
          </button>
        )}
      </div>

      {dragError && (
        <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-center justify-between gap-2">
          <span>{dragError}</span>
          <button onClick={() => setDragError('')} className="text-red-400 hover:text-red-600 font-bold text-lg leading-none">×</button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="overflow-x-auto pb-1 -mx-1 px-1">
        <div className="flex gap-4 pb-4 items-start min-w-max">
          {states.map(state => (
            <KanbanColumn
              key={state.id}
              state={state}
              items={(itemsByState.get(state.id) ?? []).filter(filterMatch)}
              activeId={activeItem?.id ?? null}
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
      className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
        on
          ? 'bg-(--rs-primary-50) border-(--rs-primary-300) text-(--rs-primary-800)'
          : 'bg-white border-(--rs-neutral-grey-200) text-(--rs-neutral-grey-600) hover:border-(--rs-neutral-grey-300)'
      }`}
    >
      {label}
    </button>
  );
}
