'use client';

import { useTransition } from 'react';
import { Star, Trash2 } from 'lucide-react';
import { updateCandidateStatus, updateCandidateRating, deleteCandidate } from './actions';

// SOP's 11 status stages. Keep in sync with ALLOWED_STATUSES in actions.ts.
const STATUSES = [
  { value: 'pending_response', label: 'Pending Response' },
  { value: 'interview_romega', label: 'Interview - Romega' },
  { value: 'endorsed_client',  label: 'Endorsed - Client' },
  { value: 'final_interview',  label: 'Final Interview' },
  { value: 'offered',          label: 'Offered' },
  { value: 'hired',            label: 'Hired' },
  { value: 'failed',           label: 'Failed' },
  { value: 'no_show',          label: 'No Show' },
  { value: 'unresponsive',     label: 'Unresponsive (>7d)' },
  { value: 'consider_other',   label: 'Consider for other positions' },
  { value: 'withdrew',         label: 'Candidate Declined / Withdrew' },
];

const STATUS_COLOR: Record<string, string> = {
  pending_response: 'bg-slate-100 text-slate-700',
  interview_romega: 'bg-blue-100 text-blue-700',
  endorsed_client:  'bg-indigo-100 text-indigo-700',
  final_interview:  'bg-violet-100 text-violet-700',
  offered:          'bg-purple-100 text-purple-700',
  hired:            'bg-green-100 text-green-700',
  failed:           'bg-red-100 text-red-700',
  no_show:          'bg-rose-100 text-rose-700',
  unresponsive:     'bg-amber-100 text-amber-700',
  consider_other:   'bg-cyan-100 text-cyan-700',
  withdrew:         'bg-stone-100 text-stone-700',
  // Legacy slugs from before the migration — show as muted so they're visible
  // but obviously old. The migration in add-recruitment-agent-fields.sql remaps these.
  applied:    'bg-slate-100 text-slate-500 italic',
  screening:  'bg-slate-100 text-slate-500 italic',
  interview:  'bg-slate-100 text-slate-500 italic',
  offer:      'bg-slate-100 text-slate-500 italic',
  rejected:   'bg-slate-100 text-slate-500 italic',
};

export function CandidateStatus({ id, status }: { id: number; status: string }) {
  const [isPending, start] = useTransition();
  return (
    <select
      defaultValue={status}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value;
        start(async () => {
          try { await updateCandidateStatus(id, next); }
          catch (err) { console.error(err); alert(err instanceof Error ? err.message : 'Update failed'); }
        });
      }}
      className={`rounded-full px-3 py-1 text-xs font-semibold capitalize border-0 cursor-pointer ${STATUS_COLOR[status] ?? 'bg-slate-100 text-slate-700'}`}
    >
      {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
    </select>
  );
}

export function CandidateRating({ id, rating }: { id: number; rating: number | null }) {
  const [isPending, start] = useTransition();
  const current = rating ?? 0;

  return (
    <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= current;
        return (
          <button
            key={n}
            type="button"
            disabled={isPending}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            onClick={() => {
              const next = current === n ? null : n;
              start(async () => {
                try { await updateCandidateRating(id, next); }
          catch (err) { console.error(err); alert(err instanceof Error ? err.message : 'Update failed'); }
              });
            }}
            className="rounded p-0.5 hover:bg-(--rs-accent-50) disabled:opacity-50 transition-colors"
          >
            <Star
              className={`w-3.5 h-3.5 ${filled ? 'fill-(--rs-accent-500) text-(--rs-accent-500)' : 'text-(--rs-neutral-grey-300)'}`}
            />
          </button>
        );
      })}
    </div>
  );
}

export function CandidateDelete({ id }: { id: number }) {
  const [isPending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label="Delete candidate"
      disabled={isPending}
      onClick={() => {
        if (!confirm('Delete this candidate? This cannot be undone.')) return;
        start(async () => {
          try { await deleteCandidate(id); }
          catch (err) { console.error(err); alert(err instanceof Error ? err.message : 'Delete failed'); }
        });
      }}
      className="rounded-md p-1.5 text-(--rs-neutral-grey-400) hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}
