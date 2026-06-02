'use client';

import { AlertTriangle, Loader2, LogOut } from 'lucide-react';
import { formatDuration, WEEKLY_CAP_SECONDS } from '@/lib/utils';

type Props = {
  weekSecondsTotal: number;
  busy: boolean;
  onClockOut: () => void;
};

/**
 * App-wide overtime status card. Rendered while the user is in approved
 * overtime — i.e. their week-to-date total has passed the 15h cap under an
 * active admin approval. Non-dismissible status indicator.
 */
export function OvertimeStatusBanner({ weekSecondsTotal, busy, onClockOut }: Props) {
  const overtimeSeconds = Math.max(0, weekSecondsTotal - WEEKLY_CAP_SECONDS);

  return (
    <div className="fixed top-3 left-1/2 z-50 -translate-x-1/2 w-[min(92vw,32rem)] rounded-2xl border border-amber-300 bg-amber-50 shadow-xl">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <div className="shrink-0 rounded-full bg-amber-200 p-1.5 text-amber-700">
          <AlertTriangle className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900">On overtime</p>
          <p className="text-xs text-amber-700">
            {formatDuration(overtimeSeconds)} over the 15h weekly limit · {formatDuration(weekSecondsTotal)} this week
          </p>
        </div>
        <button
          onClick={onClockOut}
          disabled={busy}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />}
          Clock out now
        </button>
      </div>
    </div>
  );
}
