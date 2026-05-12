'use client';

import { useEffect } from 'react';
import { Clock, LogOut, X } from 'lucide-react';
import { formatDuration } from '@/lib/utils';

type Props = {
  elapsedSeconds: number;
  onDismiss: () => void;
  onClockOut: () => void;
};

function playReminderSound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const playTone = (freq: number, startAt: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startAt);
      gain.gain.setValueAtTime(0, ctx.currentTime + startAt);
      gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + duration);
      osc.start(ctx.currentTime + startAt);
      osc.stop(ctx.currentTime + startAt + duration);
    };
    playTone(880, 0, 0.4);
    playTone(1108, 0.18, 0.5);
  } catch {
    // AudioContext blocked by browser policy — fail silently
  }
}

export function ClockOutReminderBanner({ elapsedSeconds, onDismiss, onClockOut }: Props) {
  useEffect(() => {
    playReminderSound();
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 rounded-2xl border border-amber-200 bg-white shadow-2xl">
      <div className="flex items-start gap-3 px-4 py-3 border-b border-(--rs-neutral-grey-100)">
        <div className="mt-0.5 shrink-0 rounded-full bg-amber-100 p-2 text-amber-600">
          <Clock className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-(--rs-neutral-grey-900)">Still clocked in</p>
          <p className="text-xs text-(--rs-neutral-grey-500) mt-0.5">
            You&apos;ve been clocked in for <span className="font-medium text-(--rs-neutral-grey-700)">{formatDuration(elapsedSeconds)}</span>. Don&apos;t forget to clock out!
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="shrink-0 rounded-md p-1 text-(--rs-neutral-grey-400) hover:text-(--rs-neutral-grey-600) hover:bg-(--rs-neutral-grey-100) transition-colors"
          aria-label="Dismiss reminder"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex items-center justify-end gap-2 px-4 py-2.5">
        <button
          onClick={onDismiss}
          className="rounded-lg border border-(--rs-neutral-grey-200) px-3 py-1.5 text-xs font-medium text-(--rs-neutral-grey-600) hover:bg-(--rs-neutral-grey-50) transition-colors"
        >
          Dismiss
        </button>
        <button
          onClick={onClockOut}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition-colors"
        >
          <LogOut className="w-3 h-3" />
          Clock Out Now
        </button>
      </div>
    </div>
  );
}
