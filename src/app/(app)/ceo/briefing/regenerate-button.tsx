'use client';

import { useTransition, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { regenerateTodaysBriefing } from './actions';

export function RegenerateButton({ variant = 'outline' }: { variant?: 'default' | 'outline' }) {
  const [isPending, start] = useTransition();
  const [error, setError]  = useState<string | null>(null);

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        variant={variant}
        disabled={isPending}
        aria-busy={isPending}
        onClick={() => {
          setError(null);
          start(async () => {
            try { await regenerateTodaysBriefing(); }
            catch (err) { setError(err instanceof Error ? err.message : 'Failed'); }
          });
        }}
        className="gap-2 overflow-hidden transition-all duration-300 data-[pending=true]:shadow-md"
        data-pending={isPending}
      >
        <span className="relative flex items-center">
          <RefreshCw className={`w-4 h-4 transition-transform duration-300 ${isPending ? 'animate-spin text-(--rs-primary-600)' : ''}`} />
        </span>
        {isPending ? 'Regenerating…' : 'Regenerate'}
        <span
          className={`pointer-events-none absolute inset-x-1 bottom-1 h-[2px] rounded-full bg-linear-to-r from-(--rs-primary-400) via-(--rs-primary-500) to-(--rs-accent-400) transition-opacity duration-200 ${isPending ? 'opacity-100 animate-battery-scan' : 'opacity-0'}`}
        />
      </Button>
      {error && <p className="max-w-xs text-right text-xs text-red-600 animate-slide-up">{error}</p>}
    </div>
  );
}
