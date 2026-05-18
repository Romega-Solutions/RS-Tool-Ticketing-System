'use client';

import { useEffect, useState, useCallback } from 'react';
import { TrendingUp, RefreshCw, Loader2 } from 'lucide-react';

type Fx = { rate: number; fetchedAt: string; stale: boolean };

const php = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function FxRateWidget() {
  const [fx, setFx] = useState<Fx | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // No setState before the first await — safe to call from an effect.
  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/fx/usd-php', { cache: 'no-store' });
      const data = await res.json() as { rate?: number; fetchedAt?: string; stale?: boolean; error?: string };
      if (!res.ok || typeof data.rate !== 'number') { setError(data.error || 'Rate unavailable'); return; }
      setError('');
      setFx({ rate: data.rate, fetchedAt: data.fetchedAt ?? new Date().toISOString(), stale: Boolean(data.stale) });
    } catch {
      setError('Rate service unreachable');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const id = setInterval(() => { void load(); }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white shadow-sm px-5 py-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-full bg-(--rs-primary-50) flex items-center justify-center shrink-0">
          <TrendingUp className="w-5 h-5 text-(--rs-primary-500)" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-(--rs-neutral-grey-500)">
            USD → PHP (Live)
          </p>
          {fx ? (
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-(--rs-neutral-grey-900) leading-tight">
              ₱{php(fx.rate)}
              <span className="text-sm font-normal text-(--rs-neutral-grey-400)"> per $1</span>
            </p>
          ) : error ? (
            <p className="mt-0.5 text-sm text-red-600">{error}</p>
          ) : (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-(--rs-neutral-grey-400)">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading rate…
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {fx && (
          <div className="text-right hidden sm:block">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                fx.stale
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${fx.stale ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              {fx.stale ? 'Cached' : 'Live'}
            </span>
            <p className="mt-1 text-[11px] text-(--rs-neutral-grey-400)">Updated {timeAgo(fx.fetchedAt)}</p>
          </div>
        )}
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          title="Refresh rate"
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-(--rs-neutral-grey-200) text-(--rs-neutral-grey-500) hover:border-(--rs-primary-400) hover:text-(--rs-primary-600) transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
}
