'use client';

import { useRef, useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RichTextEditor } from '@/components/rich-text-editor.client';
import { sanitizeRichText, isRichTextEmpty } from '@/lib/sanitize';
import type { ProjectCaps } from '@/lib/permissions';
import type { KanbanItem } from '@/components/kanban-board';

// Full "new task" form: set title, description, state, priority, due date,
// cycle, assignees and labels in one step instead of create → open → edit.

const PRIORITIES = [
  { value: 'none',   label: 'None' },
  { value: 'low',    label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high',   label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const inputClass =
  'w-full rounded-md border border-(--rs-neutral-grey-200) bg-white px-2.5 py-2 text-sm focus:border-(--rs-primary-400) focus:outline-none';

export type CreateTaskDefaults = { stateId: string; name?: string };

type CreateTaskFormProps = {
  onOpenChange: (open: boolean) => void;
  defaults: CreateTaskDefaults;
  projectId: string;
  states: Array<{ id: string; name: string }>;
  members: Array<{ user_id: number; name: string }>;
  labels: Array<{ id: number; name: string; color: string }>;
  cycles: Array<{ id: number; name: string }>;
  caps: ProjectCaps;
  onCreated: (stateId: string, item: KanbanItem) => void;
};

export function CreateTaskDialog({
  open,
  ...formProps
}: CreateTaskFormProps & { open: boolean }) {
  // Keep "create another" sticky across opens so batch entry stays fast.
  const [createAnother, setCreateAnother] = useState(false);
  return (
    <Dialog open={open} onOpenChange={formProps.onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>Only the title is required. Press ⌘/Ctrl + Enter to create.</DialogDescription>
        </DialogHeader>
        {/* The popup unmounts on close, so the form re-seeds from defaults on every open. */}
        <CreateTaskForm {...formProps} createAnother={createAnother} setCreateAnother={setCreateAnother} />
      </DialogContent>
    </Dialog>
  );
}

function CreateTaskForm({
  onOpenChange,
  defaults,
  projectId,
  states,
  members,
  labels,
  cycles,
  caps,
  onCreated,
  createAnother,
  setCreateAnother,
}: CreateTaskFormProps & { createAnother: boolean; setCreateAnother: (v: boolean) => void }) {
  const [name, setName] = useState(defaults.name ?? '');
  const [description, setDescription] = useState('');
  const [stateId, setStateId] = useState(defaults.stateId);
  const [priority, setPriority] = useState('none');
  const [targetDate, setTargetDate] = useState('');
  const [cycleId, setCycleId] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  const [labelIds, setLabelIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  const toggle = (list: number[], id: number) =>
    list.includes(id) ? list.filter(x => x !== id) : [...list, id];

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/tickets/work-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          name: name.trim(),
          state: stateId,
          priority,
          description: isRichTextEmpty(description) ? null : sanitizeRichText(description),
          cycle_id: cycleId ? Number(cycleId) : null,
          labelIds,
          // Restricted fields are sent only when permitted (server also strips).
          ...(caps.canEditDates ? { target_date: targetDate || null } : {}),
          ...(caps.canEditAssignees ? { assigneeUserIds: assigneeIds } : {}),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'Failed to create task');
      }
      onCreated(stateId, (await res.json()) as KanbanItem);
      if (createAnother) {
        // Keep state/cycle/assignees/labels — batch entry usually shares them.
        setName('');
        setDescription('');
        titleRef.current?.focus();
      } else {
        onOpenChange(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setSaving(false);
    }
  };

  const leadsOnly = (
    <span className="inline-flex items-center gap-0.5 text-(--rs-neutral-grey-400)">
      <Lock className="h-2.5 w-2.5" aria-hidden="true" />Leads only
    </span>
  );

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={e => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleSubmit();
      }}
      className="space-y-4"
    >
      <Field label="Title">
        <input
          ref={titleRef}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="What needs to be done?"
          required
          className={`${inputClass} text-base font-medium`}
        />
      </Field>

      <Field label="Description">
        <RichTextEditor
          value={description}
          onChange={setDescription}
          placeholder="Add a description…"
          bodyClassName="min-h-[120px] max-h-[40vh] overflow-y-auto"
          enableEmoji
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="State">
          <select value={stateId} onChange={e => setStateId(e.target.value)} className={inputClass}>
            {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>

        <Field label="Priority">
          <select value={priority} onChange={e => setPriority(e.target.value)} className={inputClass}>
            {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </Field>

        <Field label={<span className="inline-flex items-center gap-1">Due date{!caps.canEditDates && leadsOnly}</span>}>
          <input
            type="date"
            value={targetDate}
            onChange={e => setTargetDate(e.target.value)}
            disabled={!caps.canEditDates}
            className={`${inputClass} disabled:cursor-not-allowed disabled:bg-(--rs-neutral-grey-50) disabled:opacity-70`}
          />
        </Field>

        <Field label="Cycle">
          <select
            value={cycleId}
            onChange={e => setCycleId(e.target.value)}
            disabled={cycles.length === 0}
            className={`${inputClass} disabled:cursor-not-allowed disabled:bg-(--rs-neutral-grey-50) disabled:opacity-70`}
          >
            <option value="">No cycle</option>
            {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>

      <Field label={<span className="inline-flex items-center gap-1">Assignees{!caps.canEditAssignees && leadsOnly}</span>}>
        {members.length === 0 ? (
          <p className="text-xs italic text-(--rs-neutral-grey-400)">No project members yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {members.map(m => {
              const on = assigneeIds.includes(m.user_id);
              return (
                <button
                  key={m.user_id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setAssigneeIds(ids => toggle(ids, m.user_id))}
                  disabled={!caps.canEditAssignees}
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
        {labels.length === 0 ? (
          <p className="text-xs italic text-(--rs-neutral-grey-400)">No labels yet. Add some in project settings.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {labels.map(l => {
              const on = labelIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setLabelIds(ids => toggle(ids, l.id))}
                  className={`min-h-8 rounded-full border px-3 py-1 text-xs transition-opacity ${
                    on ? 'text-white' : 'bg-white text-(--rs-neutral-grey-600) opacity-60 hover:opacity-100'
                  }`}
                  style={on ? { background: l.color, borderColor: l.color } : { borderColor: l.color }}
                >
                  {l.name}
                </button>
              );
            })}
          </div>
        )}
      </Field>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-col-reverse gap-3 border-t border-(--rs-neutral-grey-100) pt-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="inline-flex items-center gap-2 text-xs text-(--rs-neutral-grey-600)">
          <input
            type="checkbox"
            checked={createAnother}
            onChange={e => setCreateAnother(e.target.checked)}
          />
          Create another
        </label>
        <div className="flex gap-2 sm:justify-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="min-h-9 rounded-md px-3 py-1.5 text-sm text-(--rs-neutral-grey-600) transition-colors hover:bg-(--rs-neutral-grey-50) hover:text-(--rs-neutral-grey-800)"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="flex min-h-9 items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: 'var(--rs-primary-500)' }}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create task
          </button>
        </div>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-(--rs-neutral-grey-500)">{label}</label>
      {children}
    </div>
  );
}
