import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export const runtime = 'nodejs';

// Free, no-key FX source. Updates roughly daily; we cache it in-process
// for 10 minutes so a room full of admins doesn't hammer the upstream.
const UPSTREAM = 'https://open.er-api.com/v6/latest/USD';
const TTL_MS = 10 * 60 * 1000;

type FxCache = { rate: number; fetchedAt: number; upstreamUpdatedAt: number | null };
let cache: FxCache | null = null;

async function fetchRate(): Promise<FxCache> {
  const res = await fetch(UPSTREAM, { cache: 'no-store' });
  if (!res.ok) throw new Error(`FX upstream returned ${res.status}`);
  const data = (await res.json()) as {
    result?: string;
    rates?: Record<string, number>;
    time_last_update_unix?: number;
  };
  const rate = data.rates?.PHP;
  if (data.result !== 'success' || typeof rate !== 'number' || !Number.isFinite(rate)) {
    throw new Error('FX upstream returned an unexpected payload');
  }
  return {
    rate,
    fetchedAt: Date.now(),
    upstreamUpdatedAt: data.time_last_update_unix ? data.time_last_update_unix * 1000 : null,
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const fresh = cache && Date.now() - cache.fetchedAt < TTL_MS;

  if (!fresh) {
    try {
      cache = await fetchRate();
    } catch (err) {
      // Upstream failed — serve the last known value if we have one,
      // flagged stale, so the UI can keep working.
      if (cache) {
        return NextResponse.json({
          rate: cache.rate,
          fetchedAt: new Date(cache.fetchedAt).toISOString(),
          upstreamUpdatedAt: cache.upstreamUpdatedAt ? new Date(cache.upstreamUpdatedAt).toISOString() : null,
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
    stale: false,
  });
}
