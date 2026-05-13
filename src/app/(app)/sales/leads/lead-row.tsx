'use client';

import { useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { updateLeadStage, deleteLead } from './actions';

const STAGES = [
  { value: 'new',       label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'proposal',  label: 'Proposal' },
  { value: 'won',       label: 'Won' },
  { value: 'lost',      label: 'Lost' },
];

const STAGE_COLOR: Record<string, string> = {
  new:       'bg-slate-100 text-slate-700',
  contacted: 'bg-blue-100 text-blue-700',
  qualified: 'bg-amber-100 text-amber-700',
  proposal:  'bg-purple-100 text-purple-700',
  won:       'bg-green-100 text-green-700',
  lost:      'bg-red-100 text-red-700',
};

export function LeadStage({ id, stage }: { id: number; stage: string }) {
  const [isPending, start] = useTransition();
  return (
    <select
      defaultValue={stage}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value;
        start(async () => {
          try { await updateLeadStage(id, next); }
          catch (err) { console.error(err); alert(err instanceof Error ? err.message : 'Update failed'); }
        });
      }}
      className={`rounded-full px-3 py-1 text-xs font-semibold capitalize border-0 cursor-pointer ${STAGE_COLOR[stage] ?? 'bg-slate-100 text-slate-700'}`}
    >
      {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
    </select>
  );
}

export function LeadDelete({ id }: { id: number }) {
  const [isPending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label="Delete lead"
      disabled={isPending}
      onClick={() => {
        if (!confirm('Delete this lead? This cannot be undone.')) return;
        start(async () => {
          try { await deleteLead(id); }
          catch (err) { console.error(err); alert(err instanceof Error ? err.message : 'Delete failed'); }
        });
      }}
      className="rounded-md p-1.5 text-(--rs-neutral-grey-400) hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}
