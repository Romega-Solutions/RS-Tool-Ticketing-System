'use client';

import { useEffect } from 'react';
import { AlertTriangle, Loader2, LogOut, Play } from 'lucide-react';
import { formatDuration, OVERTIME_THRESHOLD_SECONDS } from '@/lib/utils';

type Props = {
  elapsedSeconds: number;
  busy: boolean;
  onContinue: () => void;
  onClockOut: () => void;
  /** Seconds left before auto clock-out, or null for exempt users (no auto-out). */
  autoClockOutInSeconds?: number | null;
};

function formatMmSs(total: number): string {
  const t = Math.max(0, total);
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

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
    // Last oscillator ends at ~1.05s — close the context shortly after so it
    // doesn't linger until garbage collection on repeat OT prompts.
    setTimeout(() => { ctx.close().catch(() => {}); }, 1200);
  } catch {
    // AudioContext blocked by browser policy — fail silently
  }
}

export function OvertimeGuardrailDialog({
  elapsedSeconds,
  busy,
  onContinue,
  onClockOut,
  autoClockOutInSeconds = null,
}: Props) {
  useEffect(() => {
    playOvertimeAlert();
  }, []);

  const overtimeSeconds = Math.max(0, elapsedSeconds - OVERTIME_THRESHOLD_SECONDS);
  const showAutoOut = autoClockOutInSeconds != null;

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
                Overtime check
              </h2>
              <p className="mt-1 text-sm text-(--rs-neutral-grey-600)">
                You&apos;ve been clocked in for{' '}
                <span className="font-semibold text-(--rs-neutral-grey-900)">
                  {formatDuration(elapsedSeconds)}
                </span>
                {overtimeSeconds > 0 && (
                  <>
                    {' '}— that&apos;s{' '}
                    <span className="font-semibold text-amber-700">
                      {formatDuration(overtimeSeconds)}
                    </span>{' '}
                    past the 3-hour mark
                  </>
                )}
                . Do you want to continue into overtime?
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Choosing <span className="font-semibold">clock me out</span> ends your session now.
            Continuing keeps the timer running and flags this session as overtime.
          </div>
          {showAutoOut && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              You&apos;ll be automatically clocked out in{' '}
              <span className="font-semibold tabular-nums">{formatMmSs(autoClockOutInSeconds!)}</span>{' '}
              if you don&apos;t respond.
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-(--rs-neutral-grey-100) px-5 py-4">
          <button
            type="button"
            onClick={onClockOut}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            No, clock me out
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            Yes, continue working
          </button>
        </div>
      </div>
    </div>
  );
}
