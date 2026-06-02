'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Check, X, Clock, RefreshCw } from 'lucide-react';

type OvertimeRequest = {
  id: number;
  user_id: number;
  name: string;
  week_start: string;
  status: 'pending' | 'approved' | 'denied';
  reason: string | null;
  requested_at: string;
  decided_at: string | null;
  approved_until: string | null;
};

function fmt(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-PH', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      hour12: true, timeZone: 'Asia/Manila',
    }).format(new Date(iso));
  } catch { return iso; }
}

const STATUS_STYLE: Record<OvertimeRequest['status'], string> = {
  pending:  'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  denied:   'bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-500)',
};

export function OvertimeRequestsClient() {
  const [requests, setRequests] = useState<OvertimeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingId, setPendingId] = useState<number | null>(null);

  // No setState before the first `await`, so calling this from an effect never
  // triggers a synchronous state update within the effect body.
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/overtime-requests', { cache: 'no-store' });
      const data = (await res.json()) as { requests?: OvertimeRequest[]; error?: string };
      if (!res.ok) { setError(data.error ?? 'Failed to load requests'); return; }
      setError('');
      setRequests(data.requests ?? []);
    } catch {
      setError('Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load. Inlined as an async IIFE so every setState happens after an
  // await (never synchronously in the effect body).
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch('/api/admin/overtime-requests', { cache: 'no-store' });
        const data = (await res.json()) as { requests?: OvertimeRequest[]; error?: string };
        if (!active) return;
        if (!res.ok) { setError(data.error ?? 'Failed to load requests'); return; }
        setRequests(data.requests ?? []);
      } catch {
        if (active) setError('Failed to load requests');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  async function decide(id: number, action: 'approve' | 'deny') {
    setPendingId(id);
    try {
      const res = await fetch('/api/admin/overtime-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        setError(d.error ?? 'Action failed');
      } else {
        await load();
      }
    } catch {
      setError('Action failed');
    } finally {
      setPendingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-(--rs-neutral-grey-500) text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading requests…
      </div>
    );
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-(--rs-neutral-grey-100) bg-(--rs-neutral-grey-50)">
        <span className="text-sm font-semibold text-(--rs-neutral-grey-700)">
          {pendingCount} pending · {requests.length} total
        </span>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-(--rs-neutral-grey-500) hover:text-(--rs-primary-600) transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {error && <p className="px-4 py-2 text-xs text-red-600">{error}</p>}

      {requests.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm text-(--rs-neutral-grey-400)">
          No overtime requests.
        </div>
      ) : (
        <ul className="divide-y divide-(--rs-neutral-grey-100)">
          {requests.map(r => (
            <li key={r.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-(--rs-neutral-grey-900)">{r.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLE[r.status]}`}>
                    {r.status}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-(--rs-neutral-grey-400)">
                    <Clock className="w-3 h-3" /> week of {r.week_start}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-(--rs-neutral-grey-500)">
                  Requested {fmt(r.requested_at)}
                  {r.status === 'approved' && r.approved_until && <> · approved until {fmt(r.approved_until)}</>}
                  {r.status === 'denied' && r.decided_at && <> · denied {fmt(r.decided_at)}</>}
                </p>
                {r.reason && <p className="mt-1 text-xs text-(--rs-neutral-grey-600) italic">“{r.reason}”</p>}
              </div>

              {r.status === 'pending' && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void decide(r.id, 'approve')}
                    disabled={pendingId === r.id}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    {pendingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => void decide(r.id, 'deny')}
                    disabled={pendingId === r.id}
                    className="inline-flex items-center gap-1 rounded-lg border border-(--rs-neutral-grey-200) px-2.5 py-1.5 text-xs font-medium text-(--rs-neutral-grey-600) hover:bg-(--rs-neutral-grey-50) transition-colors disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" /> Deny
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
