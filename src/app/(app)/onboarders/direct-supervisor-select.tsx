'use client';

import { useState, useTransition } from 'react';
import { assignDirectSupervisor } from './actions';
import type { OnboardingLeadOption } from '@/lib/onboarding-lead';

export function DirectSupervisorSelect({
  onboarderId,
  currentSupervisorId,
  currentSupervisorName,
  options,
}: {
  onboarderId: number;
  currentSupervisorId: number | null;
  currentSupervisorName: string | null;
  options: OnboardingLeadOption[];
}) {
  const [value, setValue] = useState(currentSupervisorId == null ? '' : String(currentSupervisorId));
  const [isPending, start] = useTransition();
  const hasCurrentOption = currentSupervisorId != null && options.some(option => option.id === currentSupervisorId);

  return (
    <select
      value={value}
      disabled={isPending}
      aria-label="Assign direct supervisor"
      onChange={(event) => {
        const next = event.target.value;
        const supervisorId = next ? Number(next) : null;
        const previous = value;
        setValue(next);
        start(async () => {
          try {
            await assignDirectSupervisor(onboarderId, supervisorId);
          } catch (error) {
            setValue(previous);
            alert(error instanceof Error ? error.message : 'Could not update direct supervisor');
          }
        });
      }}
      className="h-7 max-w-48 rounded border border-(--rs-neutral-grey-200) bg-white px-2 text-xs font-medium text-(--rs-neutral-grey-800) outline-none focus:border-(--rs-primary-300) focus:ring-2 focus:ring-(--rs-primary-100) disabled:opacity-60"
    >
      <option value="">Unassigned</option>
      {!hasCurrentOption && currentSupervisorId != null && (
        <option value={String(currentSupervisorId)}>{currentSupervisorName ?? 'Current supervisor'}</option>
      )}
      {options.map(option => (
        <option key={option.id} value={option.id}>{option.name}</option>
      ))}
    </select>
  );
}
