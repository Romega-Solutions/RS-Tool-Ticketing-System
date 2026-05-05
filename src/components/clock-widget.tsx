'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { LogIn, LogOut, Loader2 } from 'lucide-react';

type WidgetState = 'loading' | 'out' | 'in';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function ClockWidget({ collapsed = false, variant = 'sidebar' }: { collapsed?: boolean; variant?: 'sidebar' | 'topbar' }) {
  const [state, setState] = useState<WidgetState>('loading');
  const [clockedInAt, setClockedInAt] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback((sinceIso: string) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const calc = () => Math.max(0, Math.round((Date.now() - new Date(sinceIso).getTime()) / 1000));
    setElapsed(calc());
    timerRef.current = setInterval(() => setElapsed(calc()), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setElapsed(0);
  }, []);

  // Restore state on mount / page refresh
  useEffect(() => {
    let cancelled = false;
    fetch('/api/presence')
      .then(r => r.json())
      .then((data: { openSession?: { clockedInAt: string } | null }) => {
        if (cancelled) return;
        if (data.openSession?.clockedInAt) {
          setClockedInAt(data.openSession.clockedInAt);
          startTimer(data.openSession.clockedInAt);
          setState('in');
        } else {
          setState('out');
        }
      })
      .catch(() => { if (!cancelled) setState('out'); });
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startTimer]);

  const handleClockIn = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/presence/clock-in', { method: 'POST' });
      const data = (await res.json()) as { clockedInAt?: string; error?: string };
      if (!res.ok) { setError(data.error ?? 'Failed to clock in'); return; }
      const ts = data.clockedInAt!;
      setClockedInAt(ts);
      startTimer(ts);
      setState('in');
    } catch {
      setError('Request failed');
    } finally {
      setBusy(false);
    }
  };

  const handleClockOut = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/presence/clock-out', { method: 'POST' });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Failed to clock out');
        return;
      }
      stopTimer();
      setClockedInAt(null);
      setState('out');
    } catch {
      setError('Request failed');
    } finally {
      setBusy(false);
    }
  };

  // ── Topbar variant ─────────────────────────────────────────────────────────────
  if (variant === 'topbar') {
    if (state === 'loading') {
      return (
        <div className="flex items-center gap-1.5 text-(--rs-neutral-grey-400) text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        </div>
      );
    }

    if (state === 'in') {
      return (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
            {formatDuration(elapsed)}
          </div>
          <button
            onClick={handleClockOut}
            disabled={busy}
            className="flex items-center gap-1 text-xs font-medium text-(--rs-neutral-grey-500) hover:text-red-600 border border-(--rs-neutral-grey-200) hover:border-red-300 px-2.5 py-1 rounded-full transition-colors disabled:opacity-50"
            title="Clock Out"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />}
            <span className="hidden sm:inline">Clock Out</span>
          </button>
        </div>
      );
    }

    return (
      <button
        onClick={handleClockIn}
        disabled={busy}
        className="flex items-center gap-1.5 text-xs font-medium text-(--rs-neutral-grey-600) hover:text-(--rs-primary-600) border border-(--rs-neutral-grey-200) hover:border-(--rs-primary-300) px-2.5 py-1 rounded-full transition-colors disabled:opacity-50"
        title="Clock In"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogIn className="w-3 h-3" />}
        <span className="hidden sm:inline">Clock In</span>
      </button>
    );
  }

  // ── Sidebar: collapsed icon-only ───────────────────────────────────────────────
  if (collapsed) {
    return (
      <button
        onClick={state === 'out' ? handleClockIn : handleClockOut}
        disabled={busy}
        className={`w-full flex justify-center py-2 transition-colors ${
          state === 'in'
            ? 'text-green-400 hover:text-green-300'
            : 'text-white/40 hover:text-white/80'
        }`}
        title={state === 'in' ? `Clocked in · ${formatDuration(elapsed)}` : 'Clock In'}
      >
        {busy
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : state === 'in'
          ? <span className="w-2 h-2 rounded-full bg-green-400 mt-1" />
          : <LogIn className="w-4 h-4" />}
      </button>
    );
  }

  return (
    <div className="space-y-1">
      {state === 'in' ? (
        <>
          <div className="flex items-center gap-2 px-3 py-1 text-xs text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
            <span className="font-medium">Clocked in · {formatDuration(elapsed)}</span>
          </div>
          <button
            onClick={handleClockOut}
            disabled={busy}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded-md font-medium text-red-400/80 hover:text-red-300 hover:bg-white/6 transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5 shrink-0" />}
            Clock Out
          </button>
        </>
      ) : (
        <button
          onClick={handleClockIn}
          disabled={busy}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded-md font-medium text-white/50 hover:text-white/90 hover:bg-white/6 transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5 shrink-0" />}
          Clock In
        </button>
      )}
      {error && <p className="px-3 text-[10px] text-red-400">{error}</p>}
    </div>
  );
}
