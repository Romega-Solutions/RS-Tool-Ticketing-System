import { NextResponse } from 'next/server';
import { route, requireSession } from '@/lib/api';

export const runtime = 'nodejs';

// Source of truth: Wise's own rates endpoint, so the USD→PHP figure shown
// across the app matches the mid-market rate Wise uses for payouts.
// Requires a self-serve personal/business API token (Wise → Settings → API
// tokens) in WISE_API_TOKEN. If that's absent or Wise is unreachable we fall
// back to a free, no-key feed so the app keeps working in dev/outages.
const WISE_BASE = process.env.WISE_API_URL?.replace(/\/+$/, '') || 'https://api.transferwise.com';
const WISE_TOKEN = process.env.WISE_API_TOKEN;
const FALLBACK_UPSTREAM = 'https://open.er-api.com/v6/latest/USD';
// Near-real-time: refresh from Wise at most once a minute. One call/min total
// (shared across all users via this in-process cache) stays well within Wise's
// rate limits while keeping the displayed rate within ~60s of live.
const TTL_MS = 60 * 1000;

type FxSource = 'wise' | 'erapi';
type FxCache = {
  rate: number;
  fetchedAt: number;
  upstreamUpdatedAt: number | null;
  source: FxSource;
};
let cache: FxCache | null = null;

async function fetchFromWise(): Promise<FxCache> {
  const res = await fetch(`${WISE_BASE}/v1/rates?source=USD&target=PHP`, {
    headers: { Authorization: `Bearer ${WISE_TOKEN}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Wise rates returned ${res.status}`);
  // Wise returns an array: [{ rate, source, target, time }]
  const data = (await res.json()) as Array<{ rate?: number; time?: string }>;
  const entry = Array.isArray(data) ? data[0] : undefined;
  const rate = entry?.rate;
  if (typeof rate !== 'number' || !Number.isFinite(rate)) {
    throw new Error('Wise rates returned an unexpected payload');
  }
  const t = entry?.time ? Date.parse(entry.time) : NaN;
  return {
    rate,
    fetchedAt: Date.now(),
    upstreamUpdatedAt: Number.isFinite(t) ? t : null,
    source: 'wise',
  };
}

async function fetchFromFallback(): Promise<FxCache> {
  const res = await fetch(FALLBACK_UPSTREAM, { cache: 'no-store' });
  if (!res.ok) throw new Error(`FX fallback returned ${res.status}`);
  const data = (await res.json()) as {
    result?: string;
    rates?: Record<string, number>;
    time_last_update_unix?: number;
  };
  const rate = data.rates?.PHP;
  if (data.result !== 'success' || typeof rate !== 'number' || !Number.isFinite(rate)) {
    throw new Error('FX fallback returned an unexpected payload');
  }
  return {
    rate,
    fetchedAt: Date.now(),
    upstreamUpdatedAt: data.time_last_update_unix ? data.time_last_update_unix * 1000 : null,
    source: 'erapi',
  };
}

async function fetchRate(): Promise<FxCache> {
  if (WISE_TOKEN) {
    try {
      return await fetchFromWise();
    } catch {
      // Wise failed — fall through to the free feed rather than going dark.
      return await fetchFromFallback();
    }
  }
  return await fetchFromFallback();
}

export const GET = route(async () => {
  await requireSession();

  const fresh = cache && Date.now() - cache.fetchedAt < TTL_MS;

  if (!fresh) {
    try {
      cache = await fetchRate();
    } catch (err) {
      // Everything failed — serve the last known value if we have one,
      // flagged stale, so the UI can keep working.
      if (cache) {
        return NextResponse.json({
          rate: cache.rate,
          fetchedAt: new Date(cache.fetchedAt).toISOString(),
          upstreamUpdatedAt: cache.upstreamUpdatedAt ? new Date(cache.upstreamUpdatedAt).toISOString() : null,
          source: cache.source,
          stale: true,
        });
      }
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Could not load exchange rate: ${msg}` }, { status: 502 });
    }
  }

  return NextResponse.json({
    rate: cache!.rate,
    fetchedAt: new Date(cache!.fetchedAt).toISOString(),
    upstreamUpdatedAt: cache!.upstreamUpdatedAt ? new Date(cache!.upstreamUpdatedAt).toISOString() : null,
    source: cache!.source,
    stale: false,
  });
});
