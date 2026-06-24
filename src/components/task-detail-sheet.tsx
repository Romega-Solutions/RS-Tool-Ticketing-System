'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, Loader2, MessageSquare, Activity as ActivityIcon, FileText, ImagePlus, Save, Trash2, X, Maximize2, Minimize2, Eye, Lock } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { extractTaskDescriptionImageUrls } from '@/lib/task-description-images';
import {
  appendTaskDetailCrumb,
  popTaskDetailCrumb,
  taskDetailCrumbLabel,
  type TaskDetailCrumb,
} from '@/lib/task-detail-navigation';
import { isAllowedTaskImageUpload } from '@/lib/task-image-uploads';
import { MentionTextarea, extractMentionedIds } from '@/components/mention-textarea.client';
import type { ProjectCaps } from '@/lib/permissions';

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
  caps,
  onSaved,
  onArchived,
}: {
  itemId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  states: StateOption[];
  currentUserId: number;
  isAdmin: boolean;
  caps: ProjectCaps;
  onSaved?: (updated: SheetWorkItem) => void;
  onArchived?: (itemId: string) => void;
}) {
  // Per-project capabilities drive which controls are editable.
  const canEdit = caps.canEditItem;            // member+ : general fields
  const canEditDates = caps.canEditDates;      // lead    : due date
  const canEditAssignees = caps.canEditAssignees; // lead : assignees
  const [tab, setTab] = useState<'details' | 'comments' | 'activity'>('details');

  // ── Resizable panel width ──────────────────────────────────────────────────
  // Drag the left edge to set whatever width you want (remembered per browser).
  // The maximize button is a quick preset. maxWidth caps it at 95vw, so on small
  // screens it still behaves like a full-width drawer.
  const DEFAULT_PANEL_WIDTH = 672;   // = the old max-w-2xl default
  const MIN_PANEL_WIDTH = 420;
  // Lazy init from localStorage (client only). No effect → no setState-in-effect,
  // and no hydration mismatch since the width only affects the panel, which
  // mounts when the sheet opens (after hydration).
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_PANEL_WIDTH;
    const saved = Number(localStorage.getItem('taskPanelWidth'));
    return Number.isFinite(saved) && saved >= MIN_PANEL_WIDTH ? saved : DEFAULT_PANEL_WIDTH;
  });
  const widthRef = useRef(panelWidth);
  const draggingRef = useRef(false);

  const clampWidth = (w: number) =>
    Math.min(Math.max(w, MIN_PANEL_WIDTH), typeof window !== 'undefined' ? window.innerWidth - 32 : w);
  const applyWidth = (w: number) => { const c = clampWidth(w); setPanelWidth(c); widthRef.current = c; };
  const persistWidth = () => { try { localStorage.setItem('taskPanelWidth', String(Math.round(widthRef.current))); } catch { /* ignore */ } };

  const onResizeStart = (e: React.PointerEvent) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
  };
  const onResizeMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    applyWidth(window.innerWidth - e.clientX);   // panel is anchored to the right edge
  };
  const onResizeEnd = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    persistWidth();
  };

  const isWide = panelWidth >= 900;   // enlarge title/description once it's roomy
  const toggleWide = () => {
    const wide = clampWidth(typeof window !== 'undefined' ? window.innerWidth * 0.94 : 1120);
    applyWidth(isWide ? DEFAULT_PANEL_WIDTH : wide);
    persistWidth();
  };
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Loading task...');
  const [error, setError] = useState('');
  const [navigationTrail, setNavigationTrail] = useState<TaskDetailCrumb[]>([]);
  const [navigationError, setNavigationError] = useState('');
  const [openingChildId, setOpeningChildId] = useState<number | null>(null);
  const [backLoading, setBackLoading] = useState(false);

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
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState('');

  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const descriptionImageUrls = extractTaskDescriptionImageUrls(description);

  function imageAltFromFilename(filename: string): string {
    return filename
      .replace(/\.[^.]+$/, '')
      .replace(/[[\]()]/g, '')
      .replace(/\s+/g, ' ')
      .trim() || 'task image';
  }

  function appendImageToDescription(url: string, filename: string) {
    const line = `![${imageAltFromFilename(filename)}](${url})`;
    setDescription(prev => `${prev.trimEnd()}${prev.trim() ? '\n\n' : ''}${line}`);
  }

  const refresh = useCallback(async (
    id: string,
    options: { loadingMessage?: string; surfaceError?: boolean } = {},
  ): Promise<{ ok: true } | { ok: false; message: string }> => {
    setLoadingMessage(options.loadingMessage ?? 'Loading task...');
    setLoading(true);
    if (options.surfaceError !== false) setError('');
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
      setMembers(memRes.ok ? ((await memRes.json()) as ProjectMember[]) : []);
      setProjectLabels(labRes.ok ? ((await labRes.json()) as Array<{ id: number; name: string; color: string }>) : []);
      setProjectCycles(cycRes.ok ? ((await cycRes.json()) as CycleRow[]) : []);
      setChildren(kidRes.ok ? ((await kidRes.json()) as SubIssueRow[]) : []);
      setNewSub('');
      setNewComment('');
      setImageUploadError('');
      return { ok: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed';
      if (options.surfaceError !== false) setError(message);
      return { ok: false, message };
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !itemId) return;

    const timeoutId = window.setTimeout(() => {
      setNavigationTrail([]);
      setNavigationError('');
      setOpeningChildId(null);
      setBackLoading(false);
      void refresh(itemId, { loadingMessage: 'Loading task...' });
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
          cycle_id: cycleId ? Number(cycleId) : null,
          // Restricted fields are sent only when permitted (server also strips).
          ...(canEditDates ? { target_date: targetDate || null } : {}),
          ...(canEditAssignees ? { assigneeUserIds: assigneeIds } : {}),
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
      const trimmed = newComment.trim();
      const mentions = extractMentionedIds(trimmed, members.map(m => ({ user_id: m.user_id, name: m.name })));
      const res = await fetch(`/api/tickets/work-items/${item.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: trimmed, mentions }),
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

  const handleImageUpload = async (files: FileList | null) => {
    if (!item || !files?.length) return;
    const selected = Array.from(files);
    const invalid = selected.find(file => !isAllowedTaskImageUpload(file));
    if (invalid) {
      setImageUploadError('Only JPG and PNG images are accepted.');
      return;
    }

    setImageUploading(true);
    setImageUploadError('');
    try {
      for (const file of selected) {
        const body = new FormData();
        body.append('file', file, file.name);
        const res = await fetch(`/api/tickets/work-items/${item.id}/images`, {
          method: 'POST',
          body,
        });
        const data = await res.json().catch(() => ({})) as { url?: string; name?: string; error?: string };
        if (!res.ok || !data.url) {
          throw new Error(data.error ?? `Failed to upload ${file.name}`);
        }
        appendImageToDescription(data.url, data.name ?? file.name);
      }
    } catch (e) {
      setImageUploadError(e instanceof Error ? e.message : 'Image upload failed');
    } finally {
      setImageUploading(false);
    }
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

  const openSubIssue = async (child: SubIssueRow) => {
    if (!item || loading || backLoading) return;

    const currentCrumb: TaskDetailCrumb = {
      id: item.id,
      sequenceId: item.sequence_id,
      name: item.name,
    };

    setOpeningChildId(child.id);
    setNavigationError('');

    const result = await refresh(String(child.id), {
      loadingMessage: `Opening sub-issue #${child.sequence_id}...`,
      surfaceError: false,
    });

    if (result.ok) {
      setNavigationTrail(prev => appendTaskDetailCrumb(prev, currentCrumb));
      setTab('details');
    } else {
      setNavigationError(`Could not open sub-issue #${child.sequence_id}: ${result.message}`);
    }

    setOpeningChildId(null);
  };

  const handleBackNavigation = async () => {
    if (loading || backLoading) return;

    const { previous, trail } = popTaskDetailCrumb(navigationTrail);
    if (!previous) return;

    setBackLoading(true);
    setNavigationError('');

    const previousLabel = taskDetailCrumbLabel(previous);
    const result = await refresh(previous.id, {
      loadingMessage: `Returning to ${previousLabel}...`,
      surfaceError: false,
    });

    if (result.ok) {
      setNavigationTrail(trail);
      setTab('details');
    } else {
      setNavigationError(`Could not return to ${previousLabel}: ${result.message}`);
    }

    setBackLoading(false);
  };

  const navigationBackTarget = navigationTrail[navigationTrail.length - 1] ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        style={{ width: `${panelWidth}px`, maxWidth: '95vw' }}
        className="w-full max-w-full flex flex-col gap-0 p-0"
      >
        {/* Drag the left edge to resize the panel to any width (double-click to reset). */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel — drag to change width"
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          onPointerCancel={onResizeEnd}
          onDoubleClick={() => { applyWidth(DEFAULT_PANEL_WIDTH); persistWidth(); }}
          className="group absolute left-0 top-0 z-30 hidden h-full w-2 cursor-ew-resize touch-none sm:block"
          title="Drag to resize · double-click to reset"
        >
          <span className="absolute inset-y-0 left-0 w-1 bg-(--rs-neutral-grey-200) opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <SheetHeader className="border-b border-(--rs-neutral-grey-100) px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-mono text-(--rs-neutral-grey-400) shrink-0">
                #{item?.sequence_id ?? '—'}
              </span>
              <SheetTitle className="text-base font-serif text-(--rs-neutral-grey-900) truncate">
                {item?.name ?? 'Task'}
              </SheetTitle>
            </div>
            {/* Expand / collapse the panel (sits left of the close ✕). */}
            <button
              type="button"
              onClick={toggleWide}
              className="mr-7 shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md text-(--rs-neutral-grey-400) transition-colors hover:bg-(--rs-neutral-grey-100) hover:text-(--rs-neutral-grey-700)"
              title={isWide ? 'Shrink panel' : 'Widen panel (or drag the left edge)'}
              aria-label={isWide ? 'Shrink panel' : 'Widen panel'}
              aria-pressed={isWide}
            >
              {isWide ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>
        </SheetHeader>

        {/* Tabs */}
        <div className="flex overflow-x-auto border-b border-(--rs-neutral-grey-100) px-4 sm:px-5">
          {[
            { key: 'details',  label: 'Details',  icon: FileText },
            { key: 'comments', label: 'Comments', icon: MessageSquare },
            { key: 'activity', label: 'Activity', icon: ActivityIcon },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key as typeof tab)}
              className={`flex min-h-11 flex-none items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors -mb-px ${
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

        {navigationBackTarget && (
          <div className="border-b border-(--rs-neutral-grey-100) px-4 py-2 sm:px-5">
            <button
              type="button"
              onClick={() => void handleBackNavigation()}
              disabled={loading || backLoading}
              className="flex min-h-9 max-w-full items-center gap-1.5 rounded-md px-2 text-xs font-medium text-(--rs-neutral-grey-600) transition-colors hover:bg-(--rs-neutral-grey-50) hover:text-(--rs-neutral-grey-900) disabled:cursor-not-allowed disabled:opacity-60"
            >
              {backLoading ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              ) : (
                <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="truncate">Back to {taskDetailCrumbLabel(navigationBackTarget)}</span>
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-(--rs-neutral-grey-500) py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> {loadingMessage}
            </div>
          )}
          {error && (
            <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {error}
            </div>
          )}
          {navigationError && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {navigationError}
            </div>
          )}

          {!loading && item && tab === 'details' && (
            <div className="space-y-4">
              {!canEdit && (
                <div className="flex items-center gap-2 rounded-lg border border-(--rs-accent-200) bg-(--rs-accent-50) px-3 py-2 text-xs text-(--rs-accent-800)">
                  <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span><strong>View only.</strong> You can read this task and add comments, but not edit it.</span>
                </div>
              )}
              <Field label="Title">
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  disabled={!canEdit}
                  className={`w-full rounded-md border border-(--rs-neutral-grey-200) bg-white px-3 py-2 focus:border-(--rs-primary-400) focus:outline-none disabled:cursor-not-allowed disabled:bg-(--rs-neutral-grey-50) disabled:opacity-70 ${isWide ? 'text-lg font-medium' : 'text-sm'}`}
                />
              </Field>

              <Field label="Description">
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={isWide ? 14 : 4}
                  disabled={!canEdit}
                  placeholder={canEdit ? 'Add a description…' : 'No description'}
                  className={`w-full rounded-md border border-(--rs-neutral-grey-200) bg-white px-3 py-2 resize-y focus:border-(--rs-primary-400) focus:outline-none disabled:cursor-not-allowed disabled:bg-(--rs-neutral-grey-50) disabled:opacity-70 ${isWide ? 'text-[15px] leading-relaxed' : 'text-sm'}`}
                />
                {descriptionImageUrls.length > 0 && (
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {descriptionImageUrls.map((url, index) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="group block overflow-hidden rounded-md border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) transition-colors hover:border-(--rs-primary-300) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-300)"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- Task descriptions can reference arbitrary external image URLs. */}
                        <img
                          src={url}
                          alt={`Task description screenshot ${index + 1}`}
                          className="aspect-video w-full object-cover transition-transform group-hover:scale-[1.02]"
                          loading="lazy"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </Field>

              <Field label="Images">
                <div className="rounded-md border border-dashed border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) px-3 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-(--rs-neutral-grey-800)">Upload task images</p>
                      <p className="text-xs text-(--rs-neutral-grey-500)">JPG and PNG files only.</p>
                    </div>
                    <label className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-(--rs-primary-200) bg-white px-3 text-xs font-medium text-(--rs-primary-700) transition-colors hover:bg-(--rs-primary-50) ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                      {imageUploading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ImagePlus className="h-3.5 w-3.5" />
                      )}
                      {imageUploading ? 'Uploading...' : 'Choose images'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                        multiple
                        disabled={imageUploading || !canEdit}
                        onChange={e => {
                          void handleImageUpload(e.target.files);
                          e.currentTarget.value = '';
                        }}
                        className="sr-only"
                      />
                    </label>
                  </div>
                  {imageUploadError && (
                    <p className="mt-2 text-xs text-red-600">{imageUploadError}</p>
                  )}
                  {descriptionImageUrls.length > 0 && (
                    <p className="mt-2 text-xs text-(--rs-neutral-grey-500)">
                      Uploaded images are inserted into the description and saved with the task.
                    </p>
                  )}
                </div>
              </Field>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="State">
                  <select
                    value={stateId}
                    onChange={e => setStateId(e.target.value)}
                    disabled={!canEdit}
                    className="w-full rounded-md border border-(--rs-neutral-grey-200) bg-white px-2.5 py-2 text-sm focus:border-(--rs-primary-400) focus:outline-none disabled:cursor-not-allowed disabled:bg-(--rs-neutral-grey-50) disabled:opacity-70"
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
                    disabled={!canEdit}
                    className="w-full rounded-md border border-(--rs-neutral-grey-200) bg-white px-2.5 py-2 text-sm focus:border-(--rs-primary-400) focus:outline-none disabled:cursor-not-allowed disabled:bg-(--rs-neutral-grey-50) disabled:opacity-70"
                  >
                    {PRIORITIES.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </Field>

                <Field label={<span className="inline-flex items-center gap-1">Due date{!canEditDates && <span className="inline-flex items-center gap-0.5 text-(--rs-neutral-grey-400)"><Lock className="h-2.5 w-2.5" aria-hidden="true" />Leads only</span>}</span>}>
                  <input
                    type="date"
                    value={targetDate ?? ''}
                    onChange={e => setTargetDate(e.target.value)}
                    disabled={!canEdit || !canEditDates}
                    className="w-full rounded-md border border-(--rs-neutral-grey-200) bg-white px-2.5 py-2 text-sm focus:border-(--rs-primary-400) focus:outline-none disabled:cursor-not-allowed disabled:bg-(--rs-neutral-grey-50) disabled:opacity-70"
                  />
                </Field>

                <Field label="Cycle">
                  <select
                    value={cycleId}
                    onChange={e => setCycleId(e.target.value)}
                    disabled={!canEdit}
                    className="w-full rounded-md border border-(--rs-neutral-grey-200) bg-white px-2.5 py-2 text-sm disabled:cursor-not-allowed disabled:bg-(--rs-neutral-grey-50) disabled:opacity-70"
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

              <Field label={<span className="inline-flex items-center gap-1">Assignees{!canEditAssignees && <span className="inline-flex items-center gap-0.5 text-(--rs-neutral-grey-400)"><Lock className="h-2.5 w-2.5" aria-hidden="true" />Leads only</span>}</span>}>
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
                          disabled={!canEditAssignees}
                          className={`min-h-9 rounded-full border px-3 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                            on
                              ? 'bg-(--rs-primary-50) border-(--rs-primary-300) text-(--rs-primary-800)'
                              : 'bg-white border-(--rs-neutral-grey-200) text-(--rs-neutral-grey-600) enabled:hover:border-(--rs-neutral-grey-400)'
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
                          disabled={!canEdit}
                          className={`min-h-8 rounded-full border px-3 py-1 text-xs transition-opacity disabled:cursor-not-allowed ${
                            applied ? 'text-white' : `text-(--rs-neutral-grey-600) bg-white opacity-60 ${canEdit ? 'hover:opacity-100' : ''}`
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
                    {children.map(c => {
                      const opening = openingChildId === c.id;

                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => void openSubIssue(c)}
                          disabled={loading || backLoading || openingChildId !== null}
                          aria-label={`Open sub-issue #${c.sequence_id}: ${c.name}`}
                          className="group flex min-h-10 w-full items-center gap-2 rounded-md border border-transparent px-2 text-left text-xs transition-colors hover:border-(--rs-neutral-grey-200) hover:bg-(--rs-neutral-grey-50) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-300) disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <span className="shrink-0 font-mono text-(--rs-neutral-grey-400)">#{c.sequence_id}</span>
                          <span
                            className={`min-w-0 flex-1 truncate ${
                              c.state_group === 'completed'
                                ? 'line-through text-(--rs-neutral-grey-400)'
                                : 'text-(--rs-neutral-grey-800)'
                            }`}
                          >
                            {c.name}
                          </span>
                          {c.state_name && (
                            <span
                              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-white"
                              style={{ background: c.state_color ?? '#64748b' }}
                            >
                              {c.state_name}
                            </span>
                          )}
                          {opening ? (
                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-(--rs-primary-500)" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-(--rs-neutral-grey-300) transition-colors group-hover:text-(--rs-neutral-grey-600)" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={newSub}
                    onChange={e => setNewSub(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addSubIssue()}
                    placeholder="Add a sub-issue…"
                    disabled={!canEdit}
                    className="min-h-10 flex-1 rounded-md border border-(--rs-neutral-grey-200) bg-white px-2.5 py-2 text-xs focus:border-(--rs-primary-400) focus:outline-none disabled:cursor-not-allowed disabled:bg-(--rs-neutral-grey-50) disabled:opacity-70"
                  />
                  <button
                    onClick={addSubIssue}
                    disabled={addingSub || !newSub.trim() || !canEdit}
                    className="flex min-h-10 items-center justify-center gap-1 rounded-md px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                    style={{ background: 'var(--rs-primary-500)' }}
                  >
                    {addingSub ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
                    Add
                  </button>
                </div>
              </Field>

              <div className="flex flex-col gap-3 border-t border-(--rs-neutral-grey-100) pt-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  {canEdit && (
                    <button
                      onClick={handleSave}
                      disabled={saving || !name.trim()}
                      className="flex min-h-10 items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      style={{ background: 'var(--rs-primary-500)' }}
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Save
                    </button>
                  )}
                  <span className="text-xs text-(--rs-neutral-grey-400)">
                    Updated {fmt(item.completed_at ?? '')}
                  </span>
                </div>
                {caps.canArchiveItem && (
                  <button
                    onClick={handleArchive}
                    className="flex min-h-10 items-center justify-center gap-1.5 rounded-md px-2 text-xs text-red-500 hover:bg-red-50 hover:text-red-700 sm:justify-start"
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
                          className="flex h-8 w-8 items-center justify-center rounded-md text-(--rs-neutral-grey-400) hover:bg-red-50 hover:text-red-500"
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
                <MentionTextarea
                  value={newComment}
                  onChange={setNewComment}
                  members={members}
                  rows={3}
                  placeholder="Write a comment… use @ to tag a teammate"
                  className="w-full rounded-md border border-(--rs-neutral-grey-200) bg-white px-3 py-2 text-sm resize-y focus:border-(--rs-primary-400) focus:outline-none"
                  onSubmitShortcut={handlePostComment}
                />
                <button
                  onClick={handlePostComment}
                  disabled={postingComment || !newComment.trim()}
                  className="flex min-h-10 items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
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
                <div key={a.id} className="grid gap-1 py-2 text-xs text-(--rs-neutral-grey-600) sm:flex sm:items-start sm:gap-2 sm:py-1">
                  <span className="text-(--rs-neutral-grey-400) sm:w-24 sm:shrink-0">{fmt(a.created_at)}</span>
                  <span className="font-medium text-(--rs-neutral-grey-800) sm:shrink-0">{a.actor_name}</span>
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

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
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
