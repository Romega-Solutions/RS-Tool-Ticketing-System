'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, Save, UserRoundCog } from 'lucide-react';
import type { OnboardingLeadOption } from '@/lib/onboarding-lead';
import { updateGlobalOnboardingLead } from './actions';

export function GlobalOnboardingLeadForm({
  options,
  currentLead,
  available,
  canManage,
}: {
  options: OnboardingLeadOption[];
  currentLead: OnboardingLeadOption | null;
  available: boolean;
  canManage: boolean;
}) {
  const [selectedId, setSelectedId] = useState(currentLead ? String(currentLead.id) : '');
  const [isPending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const changed = selectedId !== (currentLead ? String(currentLead.id) : '');

  function save() {
    const leadId = Number(selectedId);
    if (!Number.isInteger(leadId) || leadId <= 0) {
      setError('Select an Onboarding Lead');
      return;
    }
    setError(null);
    setMessage(null);
    start(async () => {
      try {
        const affected = await updateGlobalOnboardingLead(leadId);
        setMessage(`Saved. ${affected} active onboarding record${affected === 1 ? '' : 's'} updated.`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not update the global Onboarding Lead');
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-(--rs-primary-50) p-2 text-(--rs-primary-700)">
          <UserRoundCog className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">Current Onboarding Lead</h2>
          <p className="mt-0.5 text-sm text-(--rs-neutral-grey-500)">
            Used automatically for every new onboarder. Changing it updates all active onboarding records while preserving completed history.
          </p>
        </div>
      </div>

      {!available ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Apply <code>docs/migrations/add-global-onboarding-lead.sql</code> before configuring this setting.
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 space-y-1.5 text-sm font-medium text-(--rs-neutral-grey-700)">
            Onboarding Lead
            <select
              value={selectedId}
              onChange={(event) => { setSelectedId(event.target.value); setMessage(null); setError(null); }}
              disabled={!canManage || isPending}
              className="mt-1.5 flex h-11 w-full rounded-xl border border-(--rs-neutral-grey-200) bg-white px-3 text-sm text-(--rs-neutral-grey-900) outline-none focus:border-(--rs-primary-300) focus:ring-4 focus:ring-(--rs-primary-100) disabled:bg-(--rs-neutral-grey-50)"
            >
              <option value="" disabled>Select an eligible user</option>
              {options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          </label>
          {canManage && (
            <button
              type="button"
              onClick={save}
              disabled={isPending || !changed || !selectedId}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-(--rs-primary-600) px-5 text-sm font-semibold text-white hover:bg-(--rs-primary-700) disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending
                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                : <Save className="h-4 w-4" />}
              {isPending ? 'Saving…' : 'Save lead'}
            </button>
          )}
        </div>
      )}

      {!canManage && available && (
        <p className="text-xs text-(--rs-neutral-grey-500)">Only an Admin or Founder can change this setting.</p>
      )}
      {message && (
        <p className="flex items-center gap-1.5 text-sm text-emerald-700" role="status">
          <CheckCircle2 className="h-4 w-4" /> {message}
        </p>
      )}
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
    </div>
  );
}
