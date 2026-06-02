'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { USER_GUIDES, ADMIN_GUIDES, StepDetail, type HowTo } from '@/components/guide/guide-content';

// Guided stepper over the page-by-page guide: a numbered progress bar, ONE step
// shown at a time, Back/Next + click-to-jump. Builds its own step list from the
// shared content (icons can't cross the server→client prop boundary), so callers
// only pass the serializable `isAdmin` flag.
export function GuideWizard({ isAdmin = false }: { isAdmin?: boolean }) {
  const steps: HowTo[] = [...USER_GUIDES, ...(isAdmin ? ADMIN_GUIDES : [])];
  const [i, setI] = useState(0);
  const safe = Math.min(i, steps.length - 1);
  const current = steps[safe];
  const atFirst = safe === 0;
  const atLast = safe === steps.length - 1;

  return (
    <div className="space-y-5">
      {/* Progress bar */}
      <ol className="flex flex-wrap items-center gap-2" aria-label="Guide steps">
        {steps.map((s, idx) => {
          const StepIcon = s.icon;
          const isCurrent = idx === safe;
          const isDone = idx < safe;
          return (
            <li key={s.id} className="flex items-center">
              <button
                type="button"
                onClick={() => setI(idx)}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`Step ${idx + 1} of ${steps.length}: ${s.title}`}
                title={s.title}
                className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-300) ${
                  isCurrent
                    ? s.accent
                      ? 'bg-(--rs-accent-500) text-white ring-2 ring-(--rs-accent-200)'
                      : 'bg-(--rs-primary-500) text-white ring-2 ring-(--rs-primary-200)'
                    : isDone
                      ? 'bg-(--rs-primary-100) text-(--rs-primary-700) hover:bg-(--rs-primary-200)'
                      : 'bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-500) hover:bg-(--rs-neutral-grey-200)'
                }`}
              >
                {isDone ? <Check className="h-4 w-4" /> : <StepIcon className="h-4 w-4" />}
              </button>
              {idx < steps.length - 1 && (
                <span aria-hidden className={`mx-1 h-0.5 w-4 ${idx < safe ? 'bg-(--rs-primary-200)' : 'bg-(--rs-neutral-grey-200)'}`} />
              )}
            </li>
          );
        })}
      </ol>

      {/* Current step */}
      <StepDetail guide={current} />

      {/* Nav */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setI(v => Math.max(0, v - 1))}
          disabled={atFirst}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-(--rs-neutral-grey-200) px-3 py-2 text-sm font-medium text-(--rs-neutral-grey-700) transition-colors hover:bg-(--rs-neutral-grey-50) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-300) disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>

        <span className="text-xs font-medium tabular-nums text-(--rs-neutral-grey-500)">
          Step {safe + 1} of {steps.length}
        </span>

        <button
          type="button"
          onClick={() => setI(v => Math.min(steps.length - 1, v + 1))}
          disabled={atLast}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-(--rs-primary-500) px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-(--rs-primary-600) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-300) disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
