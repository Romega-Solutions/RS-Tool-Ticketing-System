'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, MessageSquare, Activity as ActivityIcon, FileText, Save, Trash2, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

// ── Shape we get from /api/tickets/work-items/[id] ─────────────────────────
export interface SheetWorkItem {
  id: string;
  project_id: number;
  sequence_id: number;
  name: string;
  description: string | null;
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  state: string;
  target_date: string | null;
  completed_at: string | null;
  cycle_id: number | null;
  parent_id: number | null;
  labels: Array<{ id: number; name: string; color: string }>;
  assignee_users: Array<{ id: number; name: string; email: string }>;
}

interface SubIssueRow {
  id: number; sequence_id: number; name: string;
  state_name: string | null; state_color: string | null; state_group: string | null;
}
interface CycleRow {
  id: number; name: string; start_date: string; end_date: string;
}

interface Comment {
  id: number; author_id: number; author_name: string; body: string;
  created_at: string; updated_at: string;
}
interface ActivityEntry {
  id: number; actor_name: string; action: string;
  from_value: string | null; to_value: string | null; created_at: string;
}
interface ProjectMember {
  id: number; user_id: number; name: string; email: string; role: string;
}
type StateOption = { id: string; name: string; color: string };

const PRIORITIES: Array<{ value: SheetWorkItem['priority']; label: string }> = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high',   label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low',    label: 'Low' },
  { value: 'none',   label: 'None' },
];

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500',  high: 'bg-orange-400', medium: 'bg-yellow-400',
  low: 'bg-green-400',   none: 'bg-slate-300',
};

function fmt(ts: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function TaskDetailSheet({
  itemId,
  open,
  onOpenChange,
  states,
  currentUserId,
  isAdmin,
  onSaved,
  onArchived,
}: {
  itemId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  states: StateOption[];
  currentUserId: number;
  isAdmin: boolean;
  onSaved?: (updated: SheetWorkItem) => void;
  onArchived?: (itemId: string) => void;
}) {
  const [tab, setTab] = useState<'details' | 'comments' | 'activity'>('details');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [item, setItem] = useState<SheetWorkItem | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [projectLabels, setProjectLabels] = useState<Array<{ id: number; name: string; color: string }>>([]);
  const [projectCycles, setProjectCycles] = useState<CycleRow[]>([]);
  const [children, setChildren] = useState<SubIssueRow[]>([]);
  const [newSub, setNewSub] = useState('');
  const [addingSub, setAddingSub] = useState(false);

  // Editable form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<SheetWorkItem['priority']>('none');
  const [stateId, setStateId] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [cycleId, setCycleId] = useState<string>('');
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);

  const [saving, setSaving] = useState(false);

  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  const [activity, setActivity] = useState<ActivityEntry[]>([]);

  const refresh = useCallback(async (id: string) => {
    setLoading(true); setError('');
    try {
      const [detRes, comRes, actRes] = await Promise.all([
        fetch(`/api/tickets/work-items/${id}`),
        fetch(`/api/tickets/work-items/${id}/comments`),
        fetch(`/api/tickets/work-items/${id}/activity`),
      ]);
      if (!detRes.ok) {
        const d = (await detRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? 'Failed to load task');
      }
      const detail = (await detRes.json()) as SheetWorkItem;
      setItem(detail);
      setName(detail.name);
      setDescription(detail.description ?? '');
      setPriority(detail.priority);
      setStateId(detail.state);
      setTargetDate(detail.target_date ?? '');
      setCycleId(detail.cycle_id != null ? String(detail.cycle_id) : '');
      setAssigneeIds(detail.assignee_users.map(u => u.id));
      setComments(comRes.ok ? ((await comRes.json()) as Comment[]) : []);
      setActivity(actRes.ok ? ((await actRes.json()) as ActivityEntry[]) : []);

      const [memRes, labRes, cycRes, kidRes] = await Promise.all([
        fetch(`/api/tickets/projects/${detail.project_id}/members`),
        fetch(`/api/tickets/projects/${detail.project_id}/labels`),
        fetch(`/api/tickets/projects/${detail.project_id}/cycles`),
        fetch(`/api/tickets/work-items/${id}/children`),
      ]);
      if (memRes.ok) setMembers((await memRes.json()) as ProjectMember[]);
      if (labRes.ok) setProjectLabels((await labRes.json()) as Array<{ id: number; name: string; color: string }>);
      if (cycRes.ok) setProjectCycles((await cycRes.json()) as CycleRow[]);
      if (kidRes.ok) setChildren((await kidRes.json()) as SubIssueRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !itemId) return;

    const timeoutId = window.setTimeout(() => {
      void refresh(itemId);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [open, itemId, refresh]);

  const handleSave = async () => {
    if (!item) return;
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/tickets/work-items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description,
          priority,
          state: stateId,
          target_date: targetDate || null,
          cycle_id: cycleId ? Number(cycleId) : null,
          assigneeUserIds: assigneeIds,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? 'Failed to save');
      }
      const updated = (await res.json()) as SheetWorkItem;
      setItem(updated);
      onSaved?.(updated);
      // Refresh activity (server logs the diff)
      const actRes = await fetch(`/api/tickets/work-items/${item.id}/activity`);
      if (actRes.ok) setActivity((await actRes.json()) as ActivityEntry[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handlePostComment = async () => {
    if (!item || !newComment.trim()) return;
    setPostingComment(true); setError('');
    try {
      const res = await fetch(`/api/tickets/work-items/${item.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: newComment.trim() }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? 'Failed to post');
      }
      const created = (await res.json()) as Comment;
      setComments(prev => [...prev, created]);
      setNewComment('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setPostingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!item) return;
    const res = await fetch(`/api/tickets/work-items/${item.id}/comments/${commentId}`, {
      method: 'DELETE',
    });
    if (res.ok) setComments(prev => prev.filter(c => c.id !== commentId));
  };

  const handleArchive = async () => {
    if (!item) return;
    if (!confirm('Archive this task? It will be hidden from boards and lists.')) return;
    const res = await fetch(`/api/tickets/work-items/${item.id}`, { method: 'DELETE' });
    if (res.ok) {
      onArchived?.(item.id);
      onOpenChange(false);
    } else {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      setError(d.error ?? 'Failed to archive');
    }
  };

  const toggleAssignee = (userId: number) => {
    setAssigneeIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId],
    );
  };

  const toggleLabel = async (labelId: number) => {
    if (!item) return;
    const applied = item.labels.some(l => l.id === labelId);
    if (applied) {
      const res = await fetch(`/api/tickets/work-items/${item.id}/labels?labelId=${labelId}`, { method: 'DELETE' });
      if (res.ok) setItem(prev => prev ? { ...prev, labels: prev.labels.filter(l => l.id !== labelId) } : prev);
    } else {
      const res = await fetch(`/api/tickets/work-items/${item.id}/labels`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labelId }),
      });
      if (res.ok) {
        const lab = projectLabels.find(l => l.id === labelId);
        if (lab) setItem(prev => prev ? { ...prev, labels: [...prev.labels, lab] } : prev);
      }
    }
  };

  const addSubIssue = async () => {
    if (!item || !newSub.trim()) return;
    setAddingSub(true);
    try {
      const res = await fetch('/api/tickets/work-items', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: String(item.project_id), name: newSub.trim() }),
      });
      if (!res.ok) return;
      const created = (await res.json()) as { id: string };
      // Set parent_id immediately via PATCH.
      await fetch(`/api/tickets/work-items/${created.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: Number(item.id) }),
      });
      setNewSub('');
      // Reload children list.
      const k = await fetch(`/api/tickets/work-items/${item.id}/children`);
      if (k.ok) setChildren((await k.json()) as SubIssueRow[]);
    } finally {
      setAddingSub(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col gap-0 p-0">
        <SheetHeader className="border-b border-(--rs-neutral-grey-100) px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-mono text-(--rs-neutral-grey-400) shrink-0">
                #{item?.sequence_id ?? '—'}
              </span>
              <SheetTitle className="text-base font-serif text-(--rs-neutral-grey-900) truncate">
                {item?.name ?? 'Task'}
              </SheetTitle>
            </div>
          </div>
        </SheetHeader>

        {/* Tabs */}
        <div className="flex border-b border-(--rs-neutral-grey-100) px-5">
          {[
            { key: 'details',  label: 'Details',  icon: FileText },
            { key: 'comments', label: 'Comments', icon: MessageSquare },
            { key: 'activity', label: 'Activity', icon: ActivityIcon },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key as typeof tab)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === key
                  ? 'border-(--rs-primary-500) text-(--rs-primary-700)'
                  : 'border-transparent text-(--rs-neutral-grey-500) hover:text-(--rs-neutral-grey-800)'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {key === 'comments' && comments.length > 0 && (
                <span className="text-xs bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-600) px-1.5 py-0.5 rounded-full ml-1">
                  {comments.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-(--rs-neutral-grey-500) py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          )}
          {error && (
            <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {error}
            </div>
          )}

          {!loading && item && tab === 'details' && (
            <div className="space-y-4">
              <Field label="Title">
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-(--rs-neutral-grey-200) rounded-md bg-white focus:outline-none focus:border-(--rs-primary-400)"
                />
              </Field>

              <Field label="Description">
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Add a description…"
                  className="w-full text-sm px-3 py-2 border border-(--rs-neutral-grey-200) rounded-md bg-white focus:outline-none focus:border-(--rs-primary-400) resize-y"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="State">
                  <select
                    value={stateId}
                    onChange={e => setStateId(e.target.value)}
                    className="w-full text-sm px-2.5 py-2 border border-(--rs-neutral-grey-200) rounded-md bg-white focus:outline-none focus:border-(--rs-primary-400)"
                  >
                    {states.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Priority">
                  <select
                    value={priority}
                    onChange={e => setPriority(e.target.value as SheetWorkItem['priority'])}
                    className="w-full text-sm px-2.5 py-2 border border-(--rs-neutral-grey-200) rounded-md bg-white focus:outline-none focus:border-(--rs-primary-400)"
                  >
                    {PRIORITIES.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Due date">
                  <input
                    type="date"
                    value={targetDate ?? ''}
                    onChange={e => setTargetDate(e.target.value)}
                    className="w-full text-sm px-2.5 py-2 border border-(--rs-neutral-grey-200) rounded-md bg-white focus:outline-none focus:border-(--rs-primary-400)"
                  />
                </Field>

                <Field label="Cycle">
                  <select
                    value={cycleId}
                    onChange={e => setCycleId(e.target.value)}
                    className="w-full text-sm px-2.5 py-2 border border-(--rs-neutral-grey-200) rounded-md bg-white"
                  >
                    <option value="">No cycle</option>
                    {projectCycles.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="flex items-center gap-2 px-2">
                <span className={`w-2.5 h-2.5 rounded-full ${PRIORITY_DOT[priority]}`} />
                <span className="text-xs text-(--rs-neutral-grey-500) capitalize">{priority} priority</span>
              </div>

              <Field label="Assignees">
                {members.length === 0 ? (
                  <p className="text-xs text-(--rs-neutral-grey-400) italic">
                    No project members yet. Add some in project settings.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {members.map(m => {
                      const on = assigneeIds.includes(m.user_id);
                      return (
                        <button
                          key={m.user_id}
                          onClick={() => toggleAssignee(m.user_id)}
                          className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                            on
                              ? 'bg-(--rs-primary-50) border-(--rs-primary-300) text-(--rs-primary-800)'
                              : 'bg-white border-(--rs-neutral-grey-200) text-(--rs-neutral-grey-600) hover:border-(--rs-neutral-grey-400)'
                          }`}
                        >
                          {m.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </Field>

              <Field label="Labels">
                {projectLabels.length === 0 ? (
                  <p className="text-xs text-(--rs-neutral-grey-400) italic">
                    No labels yet. Add some in project settings.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {projectLabels.map(l => {
                      const applied = item.labels.some(x => x.id === l.id);
                      return (
                        <button
                          key={l.id}
                          onClick={() => toggleLabel(l.id)}
                          className={`text-xs px-2 py-0.5 rounded-full border transition-opacity ${
                            applied ? 'text-white' : 'text-(--rs-neutral-grey-600) bg-white opacity-60 hover:opacity-100'
                          }`}
                          style={applied
                            ? { background: l.color, borderColor: l.color }
                            : { borderColor: l.color }}
                        >
                          {l.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </Field>

              <Field label={`Sub-issues${children.length > 0 ? ` (${children.length})` : ''}`}>
                {children.length > 0 && (
                  <div className="space-y-1 mb-2">
                    {children.map(c => (
                      <div key={c.id} className="flex items-center gap-2 text-xs">
                        <span className="font-mono text-(--rs-neutral-grey-400)">#{c.sequence_id}</span>
                        <span
                          className={`flex-1 truncate ${
                            c.state_group === 'completed'
                              ? 'line-through text-(--rs-neutral-grey-400)'
                              : 'text-(--rs-neutral-grey-800)'
                          }`}
                        >
                          {c.name}
                        </span>
                        {c.state_name && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded text-white"
                            style={{ background: c.state_color ?? '#64748b' }}
                          >
                            {c.state_name}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    value={newSub}
                    onChange={e => setNewSub(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addSubIssue()}
                    placeholder="Add a sub-issue…"
                    className="flex-1 text-xs px-2.5 py-1.5 border border-(--rs-neutral-grey-200) rounded-md bg-white focus:outline-none focus:border-(--rs-primary-400)"
                  />
                  <button
                    onClick={addSubIssue}
                    disabled={addingSub || !newSub.trim()}
                    className="flex items-center gap-1 text-xs font-medium text-white px-2.5 py-1.5 rounded-md disabled:opacity-50"
                    style={{ background: 'var(--rs-primary-500)' }}
                  >
                    {addingSub ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                    Add
                  </button>
                </div>
              </Field>

              <div className="flex items-center justify-between pt-2 border-t border-(--rs-neutral-grey-100)">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSave}
                    disabled={saving || !name.trim()}
                    className="flex items-center gap-1.5 text-sm font-medium text-white px-3 py-1.5 rounded-md disabled:opacity-50"
                    style={{ background: 'var(--rs-primary-500)' }}
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save
                  </button>
                  <span className="text-xs text-(--rs-neutral-grey-400)">
                    Updated {fmt(item.completed_at ?? '')}
                  </span>
                </div>
                {isAdmin && (
                  <button
                    onClick={handleArchive}
                    className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-3 h-3" /> Archive
                  </button>
                )}
              </div>
            </div>
          )}

          {!loading && item && tab === 'comments' && (
            <div className="space-y-3">
              {comments.length === 0 && (
                <p className="text-sm text-(--rs-neutral-grey-400) italic">No comments yet.</p>
              )}
              {comments.map(c => (
                <div
                  key={c.id}
                  className="border border-(--rs-neutral-grey-100) rounded-lg p-3 bg-white"
                >
                  <div className="flex items-center justify-between text-xs text-(--rs-neutral-grey-500) mb-1.5">
                    <span className="font-medium text-(--rs-neutral-grey-800)">{c.author_name}</span>
                    <div className="flex items-center gap-2">
                      <span>{fmt(c.created_at)}</span>
                      {(c.author_id === currentUserId || isAdmin) && (
                        <button
                          onClick={() => handleDeleteComment(c.id)}
                          className="text-(--rs-neutral-grey-400) hover:text-red-500"
                          title="Delete"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-(--rs-neutral-grey-800) whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}

              <div className="pt-2 space-y-2">
                <textarea
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  rows={3}
                  placeholder="Write a comment…"
                  className="w-full text-sm px-3 py-2 border border-(--rs-neutral-grey-200) rounded-md bg-white focus:outline-none focus:border-(--rs-primary-400) resize-y"
                />
                <button
                  onClick={handlePostComment}
                  disabled={postingComment || !newComment.trim()}
                  className="flex items-center gap-1.5 text-sm font-medium text-white px-3 py-1.5 rounded-md disabled:opacity-50"
                  style={{ background: 'var(--rs-primary-500)' }}
                >
                  {postingComment && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Post comment
                </button>
              </div>
            </div>
          )}

          {!loading && item && tab === 'activity' && (
            <div className="space-y-2">
              {activity.length === 0 && (
                <p className="text-sm text-(--rs-neutral-grey-400) italic">No activity yet.</p>
              )}
              {activity.map(a => (
                <div key={a.id} className="text-xs text-(--rs-neutral-grey-600) flex items-start gap-2 py-1">
                  <span className="text-(--rs-neutral-grey-400) shrink-0 w-24">{fmt(a.created_at)}</span>
                  <span className="font-medium text-(--rs-neutral-grey-800) shrink-0">{a.actor_name}</span>
                  <span className="text-(--rs-neutral-grey-500)">
                    {describeActivity(a)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-(--rs-neutral-grey-500) mb-1">{label}</label>
      {children}
    </div>
  );
}

function describeActivity(a: ActivityEntry): string {
  switch (a.action) {
    case 'created':       return `created this task`;
    case 'state_changed': return `moved state ${a.from_value ?? '—'} → ${a.to_value ?? '—'}`;
    case 'edited':        return `edited ${a.to_value ?? a.from_value ?? 'field'}`;
    case 'assigned':      return `assigned user ${a.to_value}`;
    case 'unassigned':    return `unassigned user ${a.from_value}`;
    case 'commented':     return `commented: "${(a.to_value ?? '').slice(0, 60)}${(a.to_value?.length ?? 0) > 60 ? '…' : ''}"`;
    case 'archived':      return `archived this task`;
    default:              return a.action;
  }
}
