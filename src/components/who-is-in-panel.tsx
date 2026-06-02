'use client';

import { useState, useEffect, useRef } from 'react';
import { LogOut, Loader2, X } from 'lucide-react';
import { isOvertime } from '@/lib/utils';
import { PersonAvatar } from '@/components/person-avatar';

// ── Types ──────────────────────────────────────────────────────────────────────

type PresenceUser = {
  userId:      number;
  name:        string;
  role:        string;
  team:        string | null;
  clockedInAt: string;
  weekSecondsBefore?: number;
  photoUrl?:   string | null;
};

type SSEEvent =
  | { type: 'snapshot'; online: PresenceUser[] }
  | { type: 'clock_in';  user: PresenceUser }
  | { type: 'clock_out'; userId: number };

// ── Helpers ────────────────────────────────────────────────────────────────────

function sinceLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function LiveDuration({ clockedInAt, weekSecondsBefore = 0 }: { clockedInAt: string; weekSecondsBefore?: number }) {
  const [secs, setSecs] = useState(() =>
    Math.max(0, Math.round((Date.now() - new Date(clockedInAt).getTime()) / 1000))
  );

  useEffect(() => {
    const id = setInterval(() =>
      setSecs(Math.max(0, Math.round((Date.now() - new Date(clockedInAt).getTime()) / 1000))),
      1000
    );
    return () => clearInterval(id);
  }, [clockedInAt]);

  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const over = isOvertime(weekSecondsBefore + secs);
  const label = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return (
    <span className={over ? 'text-amber-600' : 'text-green-600'}>
      {over && <span className="font-bold">OT </span>}
      {label}
    </span>
  );
}

// ── Panel content (pure presentation) ────────────────────────────────────────

function PanelContent({
  sorted,
  connected,
  isAdmin,
  pendingId,
  forceClockOut,
}: {
  sorted: PresenceUser[];
  connected: boolean;
  isAdmin: boolean;
  pendingId: number | null;
  forceClockOut: (user: PresenceUser) => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-(--rs-neutral-grey-100)">
        <div className="flex items-center gap-2">
          <span className="text-sm font-serif font-semibold text-(--rs-neutral-grey-900)">Who&apos;s In</span>
          {sorted.length > 0 && (
            <span className="bg-green-100 text-green-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
              {sorted.length}
            </span>
          )}
        </div>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
          connected
            ? 'bg-green-50 text-green-600'
            : 'bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-400)'
        }`}>
          {connected ? 'Live' : 'Connecting…'}
        </span>
      </div>

      {/* People list */}
      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center px-4">
            <p className="text-sm text-(--rs-neutral-grey-400)">No one is clocked in right now.</p>
          </div>
        ) : (
          <div className="divide-y divide-(--rs-neutral-grey-100)">
            {sorted.map(user => {
              const busy = pendingId === user.userId;
              return (
                <div key={user.userId} className="group flex items-center gap-3 px-4 py-3 hover:bg-(--rs-neutral-grey-50)">
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <PersonAvatar name={user.name} photoUrl={user.photoUrl} size={36} />
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 border-2 border-white">
                      <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-60" />
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-(--rs-neutral-grey-900) truncate">{user.name}</p>
                    {user.team && (
                      <p className="text-xs text-(--rs-neutral-grey-400) truncate">{user.team}</p>
                    )}
                  </div>

                  {/* Time */}
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-semibold tabular-nums">
                      <LiveDuration clockedInAt={user.clockedInAt} weekSecondsBefore={user.weekSecondsBefore} />
                    </p>
                    <p className="text-[10px] text-(--rs-neutral-grey-400)">since {sinceLabel(user.clockedInAt)}</p>
                  </div>

                  {/* Admin: force clock-out */}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => forceClockOut(user)}
                      disabled={busy}
                      title={`Force clock-out ${user.name}`}
                      aria-label={`Force clock-out ${user.name}`}
                      className="shrink-0 rounded p-1.5 text-orange-500 hover:bg-orange-50 hover:text-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {busy
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <LogOut className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Topbar button + slide-over panel ──────────────────────────────────────────

export function WhoIsInPanel({ isAdmin = false }: { isAdmin?: boolean }) {
  const [open, setOpen]           = useState(false);
  const [online, setOnline]       = useState<PresenceUser[]>([]);
  const [connected, setConnected] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const esRef = useRef<EventSource | null>(null);

  async function forceClockOut(user: PresenceUser) {
    if (!confirm(`Force clock-out ${user.name}? Their open session will be closed now.`)) return;
    setPendingId(user.userId);
    try {
      const res = await fetch('/api/admin/timesheets/force-clock-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.userId }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Force clock-out failed');
      // SSE will drop them from `online` via the clock_out event.
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Force clock-out failed');
    } finally {
      setPendingId(null);
    }
  }

  // Single SSE connection for both the badge count and the panel list
  useEffect(() => {
    const es = new EventSource('/api/presence/live');
    esRef.current = es;

    es.onopen  = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (e) => {
      const event = JSON.parse(e.data as string) as SSEEvent;
      if (event.type === 'snapshot') {
        setOnline(event.online);
        setConnected(true);
      } else if (event.type === 'clock_in') {
        setOnline(prev => {
          const exists = prev.some(u => u.userId === event.user.userId);
          return exists
            ? prev.map(u => u.userId === event.user.userId ? event.user : u)
            : [...prev, event.user];
        });
      } else if (event.type === 'clock_out') {
        setOnline(prev => prev.filter(u => u.userId !== event.userId));
      }
    };

    return () => { es.close(); esRef.current = null; };
  }, []);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const count = online.length;
  const sorted = [...online].sort(
    (a, b) => new Date(a.clockedInAt).getTime() - new Date(b.clockedInAt).getTime()
  );

  return (
    <>
      {/* Topbar button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`relative flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${
          open
            ? 'bg-(--rs-primary-50) border-(--rs-primary-300) text-(--rs-primary-700)'
            : 'border-(--rs-neutral-grey-200) text-(--rs-neutral-grey-600) hover:border-(--rs-primary-300) hover:text-(--rs-primary-600)'
        }`}
        aria-label="Who's in"
      >
        {/* Status dot — green when someone is in, grey otherwise */}
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          count > 0 && connected ? 'bg-green-500' : 'bg-(--rs-neutral-grey-300)'
        }`} />
        <span className="hidden sm:inline">Who&apos;s In</span>
        {count > 0 && (
          <span className="bg-green-100 text-green-700 font-bold px-1 rounded-full text-[10px] leading-none py-0.5">
            {count}
          </span>
        )}
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 z-40 backdrop-blur-[1px]"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-over panel */}
      <div
        className={`fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-50 flex flex-col transition-transform duration-200 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-label="Who's In"
        aria-modal="true"
      >
        {/* Close button */}
        <button
          onClick={() => setOpen(false)}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-md text-(--rs-neutral-grey-400) hover:text-(--rs-neutral-grey-700) hover:bg-(--rs-neutral-grey-100) transition-colors"
          aria-label="Close panel"
        >
          <X className="w-4 h-4" />
        </button>

        {open && (
          <PanelContent
            sorted={sorted}
            connected={connected}
            isAdmin={isAdmin}
            pendingId={pendingId}
            forceClockOut={forceClockOut}
          />
        )}
      </div>
    </>
  );
}
