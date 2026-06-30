'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { RefreshCw, ArrowRightLeft, TrendingUp, Loader2, ExternalLink } from 'lucide-react';
import { roleDisplayLabel } from '@/lib/rbac';

// Wise's public mid-market converter — anyone can open this and confirm the
// rate we show matches Wise live, no login needed.
const WISE_VERIFY_URL = 'https://wise.com/us/currency-converter/usd-to-php-rate?amount=1';

export type RateUser = {
  id: number;
  name: string;
  role: string;
  team: string | null;
  hourlyRateUsd: number | null;
  isActive: boolean;
};

type FxState = {
  rate: number;
  fetchedAt: string;
  upstreamUpdatedAt: string | null;
  stale: boolean;
  source: 'wise' | 'erapi' | null;
};

const usd = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

export function RatesClient({ users }: { users: RateUser[] }) {
  const [fx, setFx] = useState<FxState | null>(null);
  const [fxError, setFxError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Converter: store only the side the user last edited; derive the other.
  const [raw, setRaw] = useState('1');
  const [side, setSide] = useState<'usd' | 'php'>('usd');
  const [showInactive, setShowInactive] = useState(false);

  // No setState before the first await — safe to call from an effect.
  const loadFx = useCallback(async () => {
    try {
      const res  = await fetch('/api/fx/usd-php', { cache: 'no-store' });
      const data = await res.json() as Partial<FxState> & { error?: string };
      if (!res.ok || typeof data.rate !== 'number') {
        setFxError(data.error || 'Could not load exchange rate');
        return;
      }
      setFxError('');
      setFx({
        rate: data.rate,
        fetchedAt: data.fetchedAt ?? new Date().toISOString(),
        upstreamUpdatedAt: data.upstreamUpdatedAt ?? null,
        stale: Boolean(data.stale),
        source: data.source ?? null,
      });
    } catch {
      setFxError('Could not reach the exchange-rate service');
    }
  }, []);

  useEffect(() => {
    // Initial + periodic fetch. loadFx defers all setState until after the
    // first await, so this is a safe async data-load, not a cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadFx();
    const id = setInterval(() => { void loadFx(); }, 60 * 1000); // auto-refresh every minute
    return () => clearInterval(id);
  }, [loadFx]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadFx();
    setRefreshing(false);
  };

  // Derived converter values — no effect needed.
  const num = raw === '' ? null : Number(raw);
  const valid = num != null && Number.isFinite(num);
  const usdValue = side === 'usd'
    ? raw
    : valid && fx ? (num! / fx.rate).toFixed(2) : '';
  const phpValue = side === 'php'
    ? raw
    : valid && fx ? (num! * fx.rate).toFixed(2) : '';

  const visible = useMemo(
    () => users.filter(u => showInactive || u.isActive),
    [users, showInactive],
  );
  const withRate = visible.filter(u => u.hourlyRateUsd != null).length;

  return (
    <div className="space-y-6">
      {/* ── Live rate + manual converter ── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {/* Live rate card */}
        <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-(--rs-neutral-grey-500)">
              <TrendingUp className="w-4 h-4 text-(--rs-primary-500)" />
              Live Rate
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-(--rs-neutral-grey-200) px-2.5 py-1 text-xs font-medium text-(--rs-neutral-grey-600) hover:border-(--rs-primary-400) hover:text-(--rs-primary-600) transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {fxError && !fx ? (
            <p className="mt-6 text-sm text-red-600">{fxError}</p>
          ) : fx ? (
            <>
              <p className="mt-4 text-4xl font-serif font-bold text-(--rs-neutral-grey-900) tabular-nums leading-none">
                ₱ {php(fx.rate)}
                <span className="ml-2 text-sm font-sans font-normal text-(--rs-neutral-grey-400)">per $1 USD</span>
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-(--rs-neutral-grey-400)">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
                    fx.stale
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${fx.stale ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  {fx.stale ? 'Cached' : 'Live'}
                </span>
                {fx.source === 'wise' ? (
                  <span className="font-semibold text-(--rs-primary-600)">via Wise (real payout rate)</span>
                ) : fx.source === 'erapi' ? (
                  <span className="font-medium text-amber-600">fallback feed — Wise unavailable</span>
                ) : null}
                <span>Updated {timeAgo(fx.fetchedAt)}</span>
                <a
                  href={WISE_VERIFY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 font-medium text-(--rs-primary-600) hover:text-(--rs-primary-700) hover:underline"
                >
                  Double-check on Wise <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </>
          ) : (
            <div className="mt-6 flex items-center gap-2 text-sm text-(--rs-neutral-grey-400)">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading rate…
            </div>
          )}
        </div>

        {/* Manual converter */}
        <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-(--rs-neutral-grey-500)">
            <ArrowRightLeft className="w-4 h-4 text-(--rs-primary-500)" />
            Converter
          </div>
          <div className="mt-4 flex items-end gap-3">
            <label className="flex-1">
              <span className="block text-xs font-medium text-(--rs-neutral-grey-500) mb-1">USD ($)</span>
              <input
                type="number" min="0" step="0.01" inputMode="decimal"
                value={usdValue}
                onChange={e => { setSide('usd'); setRaw(e.target.value); }}
                disabled={!fx}
                className="w-full rounded-lg border border-(--rs-neutral-grey-300) px-3 py-2 text-sm tabular-nums outline-none focus:border-(--rs-primary-400) focus:ring-2 focus:ring-(--rs-primary-100) disabled:bg-(--rs-neutral-grey-50)"
              />
            </label>
            <ArrowRightLeft className="w-4 h-4 mb-2.5 shrink-0 text-(--rs-neutral-grey-300)" />
            <label className="flex-1">
              <span className="block text-xs font-medium text-(--rs-neutral-grey-500) mb-1">PHP (₱)</span>
              <input
                type="number" min="0" step="0.01" inputMode="decimal"
                value={phpValue}
                onChange={e => { setSide('php'); setRaw(e.target.value); }}
                disabled={!fx}
                className="w-full rounded-lg border border-(--rs-neutral-grey-300) px-3 py-2 text-sm tabular-nums outline-none focus:border-(--rs-primary-400) focus:ring-2 focus:ring-(--rs-primary-100) disabled:bg-(--rs-neutral-grey-50)"
              />
            </label>
          </div>
          <p className="mt-3 text-[11px] text-(--rs-neutral-grey-400)">
            Type in either box — the other updates using the live rate above.
          </p>
        </div>
      </div>

      {/* ── Per-user rate table ── */}
      <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50)">
          <span className="text-sm font-semibold text-(--rs-neutral-grey-700)">
            Team Rates <span className="text-(--rs-neutral-grey-400) font-normal">· {withRate} with a rate set</span>
          </span>
          <label className="flex items-center gap-2 text-xs text-(--rs-neutral-grey-500) cursor-pointer select-none">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-(--rs-primary-500)" />
            Show inactive
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-(--rs-neutral-grey-200) text-(--rs-neutral-grey-600)">
                <th className="text-left px-4 py-2.5 font-semibold">Name</th>
                <th className="text-left px-4 py-2.5 font-semibold w-28">Role</th>
                <th className="text-right px-4 py-2.5 font-semibold w-36">Rate (USD/hr)</th>
                <th className="text-right px-4 py-2.5 font-semibold w-44">Equivalent (PHP/hr)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--rs-neutral-grey-100)">
              {visible.map(u => (
                <tr key={u.id} className={`hover:bg-(--rs-neutral-grey-50) ${!u.isActive ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-(--rs-neutral-grey-900)">{u.name}</div>
                    {u.team && <div className="text-xs text-(--rs-neutral-grey-400)">{u.team}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-(--rs-neutral-grey-600)">{roleDisplayLabel(u.role)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {u.hourlyRateUsd != null
                      ? <span className="font-medium text-(--rs-neutral-grey-800)">$ {usd(u.hourlyRateUsd)}</span>
                      : <span className="text-xs text-(--rs-neutral-grey-300) italic">Not set</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {u.hourlyRateUsd != null && fx
                      ? <span className="font-semibold text-(--rs-primary-600)">₱ {php(u.hourlyRateUsd * fx.rate)}</span>
                      : <span className="text-xs text-(--rs-neutral-grey-300)">—</span>}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-(--rs-neutral-grey-400) italic text-sm">
                    No users to show.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
