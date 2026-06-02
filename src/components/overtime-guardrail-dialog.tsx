'use client';

import { useEffect } from 'react';
import { AlertTriangle, Loader2, Check, Send } from 'lucide-react';
import { formatDuration } from '@/lib/utils';

type RequestState = 'idle' | 'sending' | 'pending' | 'error';

type Props = {
  weekSecondsTotal: number;
  requestState: RequestState;
  onRequest: () => void;
  onClose: () => void;
};

// Urgent three-tone alert — more insistent than the soft clock-out chime.
function playOvertimeAlert() {
  try {
    const ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const beep = (freq: number, startAt: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startAt);
      gain.gain.setValueAtTime(0, ctx.currentTime + startAt);
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + duration);
      osc.start(ctx.currentTime + startAt);
      osc.stop(ctx.currentTime + startAt + duration);
    };
    beep(880, 0, 0.25);
    beep(880, 0.3, 0.25);
    beep(1175, 0.6, 0.45);
    setTimeout(() => { ctx.close().catch(() => {}); }, 1200);
  } catch {
    // AudioContext blocked by browser policy — fail silently
  }
}

// Shown the moment a non-admin crosses the 15-hour weekly cap. The session has
// already been stopped (server-enforced); overtime is no longer self-served —
// the contractor must request it and an admin must approve before continuing.
export function OvertimeGuardrailDialog({ weekSecondsTotal, requestState, onRequest, onClose }: Props) {
  useEffect(() => {
    playOvertimeAlert();
  }, []);

  const pending = requestState === 'pending';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-2xl border border-amber-300 bg-white shadow-2xl">
        <div className="border-b border-(--rs-neutral-grey-100) px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0 rounded-full bg-amber-100 p-2 text-amber-600">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-serif font-semibold text-(--rs-neutral-grey-900)">
                Weekly 15-hour limit reached
              </h2>
              <p className="mt-1 text-sm text-(--rs-neutral-grey-600)">
                You&apos;ve hit{' '}
                <span className="font-semibold text-(--rs-neutral-grey-900)">
                  {formatDuration(weekSecondsTotal)}
                </span>
                {' '}this week and have been clocked out. Overtime needs an admin&apos;s approval —
                request it below and you&apos;ll be able to clock back in once it&apos;s approved.
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4">
          {pending ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Overtime requested — waiting for an admin to approve. You&apos;ll be able to clock
              back in once they do.
            </div>
          ) : requestState === 'error' ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Couldn&apos;t send the request. Please try again.
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              The 15-hour weekly limit is enforced automatically. An admin can grant overtime
              for the rest of today.
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-(--rs-neutral-grey-100) px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-lg border border-(--rs-neutral-grey-200) px-3 py-2 text-sm font-medium text-(--rs-neutral-grey-600) transition-colors hover:bg-(--rs-neutral-grey-50)"
          >
            {pending ? 'Close' : 'Not now'}
          </button>
          {!pending && (
            <button
              type="button"
              onClick={onRequest}
              disabled={requestState === 'sending'}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
            >
              {requestState === 'sending'
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />}
              Request overtime
            </button>
          )}
          {pending && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-700">
              <Check className="w-4 h-4" /> Requested
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
