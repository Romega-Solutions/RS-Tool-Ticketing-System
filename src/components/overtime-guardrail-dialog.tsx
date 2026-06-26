'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle, Loader2, Check, Send, ShieldCheck } from 'lucide-react';
import { formatDuration } from '@/lib/utils';

type RequestState = 'idle' | 'sending' | 'pending' | 'error';

// 'crossed'  → user hit the cap live, mid-session (loud alert — demands attention).
// 'on-open'  → user opened the app already over the cap (calmer, no alarm).
type Variant = 'crossed' | 'on-open';

type Props = {
  weekSecondsTotal: number;
  requestState: RequestState;
  onRequest: () => void;
  onClose: () => void;
  variant?: Variant;
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

// Shown when a non-admin is over the 15-hour weekly cap. The session has already
// been stopped server-side; overtime is no longer self-served — the contractor
// must request it and their attendance admin must approve before continuing.
export function OvertimeGuardrailDialog({
  weekSecondsTotal,
  requestState,
  onRequest,
  onClose,
  variant = 'crossed',
}: Props) {
  const pending = requestState === 'pending';
  const primaryRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Loud alarm only when the user crosses the cap live. On a passive "you opened
  // the app over the limit" reminder, staying silent is the right call.
  useEffect(() => {
    if (variant === 'crossed') playOvertimeAlert();
  }, [variant]);

  // Move focus into the dialog and close on Escape (modal a11y basics).
  useEffect(() => {
    (pending ? closeRef.current : primaryRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, onClose]);

  const heading = variant === 'on-open'
    ? 'You’re at your weekly hour limit'
    : 'Weekly hour limit reached';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ot-guardrail-title"
        aria-describedby="ot-guardrail-desc"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-amber-300 bg-white shadow-2xl"
      >
        <div className="border-b border-(--rs-neutral-grey-100) px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0 rounded-full bg-amber-100 p-2 text-amber-600">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="ot-guardrail-title" className="text-base font-serif font-semibold text-(--rs-neutral-grey-900)">
                {heading}
              </h2>
              <p id="ot-guardrail-desc" className="mt-1 text-sm text-(--rs-neutral-grey-600)">
                You’ve logged{' '}
                <span className="font-semibold text-(--rs-neutral-grey-900)">
                  {formatDuration(weekSecondsTotal)}
                </span>
                {' '}this week and have been clocked out. To keep working you need overtime
                approved — send a request and your{' '}
                <span className="font-semibold text-(--rs-neutral-grey-900)">attendance admin</span>{' '}
                will be notified to review it.
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4">
          {pending ? (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <ShieldCheck className="mt-0.5 w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                Overtime requested — your attendance admin has been notified. You’ll be able to
                clock back in once they approve.
              </span>
            </div>
          ) : requestState === 'error' ? (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Couldn’t send the request. Please try again.
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Overtime is approved by your attendance admin. Send a request and they can grant you
              a short extension (30 minutes, 1 hour, or 2 hours).
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-(--rs-neutral-grey-100) px-5 py-4">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-lg border border-(--rs-neutral-grey-200) px-3 py-2 text-sm font-medium text-(--rs-neutral-grey-600) transition-colors hover:bg-(--rs-neutral-grey-50) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-neutral-grey-400) focus-visible:ring-offset-2"
          >
            {pending ? 'Close' : 'Not now'}
          </button>
          {!pending && (
            <button
              ref={primaryRef}
              type="button"
              onClick={onRequest}
              disabled={requestState === 'sending'}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 focus-visible:ring-offset-2 disabled:opacity-50"
            >
              {requestState === 'sending'
                ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                : <Send className="w-4 h-4" aria-hidden="true" />}
              Request overtime
            </button>
          )}
          {pending && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-700">
              <Check className="w-4 h-4" aria-hidden="true" /> Requested
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
