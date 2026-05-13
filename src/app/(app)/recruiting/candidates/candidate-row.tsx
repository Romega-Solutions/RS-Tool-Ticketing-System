'use client';

import { useTransition } from 'react';
import { Star, Trash2 } from 'lucide-react';
import { updateCandidateStatus, updateCandidateRating, deleteCandidate } from './actions';

const STATUSES = [
  { value: 'applied',   label: 'Applied' },
  { value: 'screening', label: 'Screening' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer',     label: 'Offer' },
  { value: 'hired',     label: 'Hired' },
  { value: 'rejected',  label: 'Rejected' },
];

const STATUS_COLOR: Record<string, string> = {
  applied:   'bg-slate-100 text-slate-700',
  screening: 'bg-blue-100 text-blue-700',
  interview: 'bg-amber-100 text-amber-700',
  offer:     'bg-purple-100 text-purple-700',
  hired:     'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-700',
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
