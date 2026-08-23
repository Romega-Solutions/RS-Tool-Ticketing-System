'use client';

import { useState, useTransition } from 'react';
import { assignOnboardingLead } from './actions';
import type { OnboardingLeadOption } from '@/lib/onboarding-lead';

export function OnboardingLeadSelect({
  onboarderId,
  currentLeadId,
  currentLeadName,
  options,
}: {
  onboarderId: number;
  currentLeadId: number | null;
  currentLeadName: string | null;
  options: OnboardingLeadOption[];
}) {
  const [value, setValue] = useState(currentLeadId == null ? '' : String(currentLeadId));
  const [isPending, start] = useTransition();
  const hasCurrentOption = currentLeadId != null && options.some(option => option.id === currentLeadId);

  return (
    <select
      value={value}
      disabled={isPending}
      aria-label="Assign onboarding lead"
      onChange={(event) => {
        const next = event.target.value;
        const leadId = next ? Number(next) : null;
        const previous = value;
        setValue(next);
        start(async () => {
          try {
            await assignOnboardingLead(onboarderId, leadId);
          } catch (error) {
            setValue(previous);
            alert(error instanceof Error ? error.message : 'Could not update onboarding lead');
          }
        });
      }}
      className="h-7 max-w-48 rounded border border-(--rs-neutral-grey-200) bg-white px-2 text-xs font-medium text-(--rs-neutral-grey-800) outline-none focus:border-(--rs-primary-300) focus:ring-2 focus:ring-(--rs-primary-100) disabled:opacity-60"
    >
      <option value="">Unassigned</option>
      {!hasCurrentOption && currentLeadId != null && (
        <option value={String(currentLeadId)}>{currentLeadName ?? 'Current lead'}</option>
      )}
      {options.map(option => (
        <option key={option.id} value={option.id}>{option.name}</option>
      ))}
    </select>
  );
}
