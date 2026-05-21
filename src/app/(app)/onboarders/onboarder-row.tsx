'use client';

import { useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { ALLOWED_STATUSES, type OnboarderStatus } from './constants';
import { updateOnboarderStatus, deleteOnboarder } from './actions';

export const STATUS_LABEL: Record<OnboarderStatus, string> = {
  offer_signed:      'Offer signed',
  background_check:  'Background check',
  pre_onboarding:    'Pre-onboarding',
  day_one:           'Day 1',
  thirty_day:        '30-day check-in',
  ninety_day:        '90-day review',
  regularized:       'Regularized',
  failed_probation:  'Failed probation',
  withdrew:          'Withdrew',
};

export const STATUS_COLOR: Record<OnboarderStatus, string> = {
  offer_signed:     'bg-slate-100 text-slate-700',
  background_check: 'bg-amber-100 text-amber-800',
  pre_onboarding:   'bg-blue-100 text-blue-700',
  day_one:          'bg-(--rs-primary-100) text-(--rs-primary-800)',
  thirty_day:       'bg-(--rs-primary-100) text-(--rs-primary-800)',
  ninety_day:       'bg-(--rs-primary-100) text-(--rs-primary-800)',
  regularized:      'bg-green-100 text-green-700',
  failed_probation: 'bg-red-100 text-red-700',
  withdrew:         'bg-stone-100 text-stone-700',
};

export function OnboarderStatusSelect({ id, status }: { id: number; status: string }) {
  const [isPending, start] = useTransition();
  const color = STATUS_COLOR[status as OnboarderStatus] ?? 'bg-slate-100 text-slate-700';
  return (
    <select
      defaultValue={status}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value;
        start(async () => {
          try { await updateOnboarderStatus(id, next); }
          catch (err) { console.error(err); alert(err instanceof Error ? err.message : 'Update failed'); }
        });
      }}
      className={`rounded-full px-3 py-1 text-xs font-semibold border-0 cursor-pointer outline-hidden focus:ring-3 focus:ring-(--rs-primary-100) ${color}`}
    >
      {ALLOWED_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
    </select>
  );
}

export function OnboarderDelete({ id }: { id: number }) {
  const [isPending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label="Delete onboarder"
      disabled={isPending}
      onClick={() => {
        if (!confirm('Delete this onboarder record? This cannot be undone.')) return;
        start(async () => {
          try { await deleteOnboarder(id); }
          catch (err) { console.error(err); alert(err instanceof Error ? err.message : 'Delete failed'); }
        });
      }}
      className="rounded-md p-1.5 text-(--rs-neutral-grey-400) hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}
