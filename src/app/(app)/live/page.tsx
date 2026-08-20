'use client';

import { useState, useEffect } from 'react';
import { Radio, Loader2 } from 'lucide-react';
import { isOvertime } from '@/lib/utils';
import { roleDisplayLabel } from '@/lib/rbac';
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

// ── Helpers ────────────────────────────────────────────────────────────────────

function sinceLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function roleColor(role: string): string {
  const r = role.toLowerCase();
  if (['admin', 'ceo', 'owner', 'superadmin'].includes(r)) {
    return 'bg-(--rs-accent-100) text-(--rs-accent-700)';
  }
  if (['lead', 'team_lead', 'teamlead', 'manager', 'tl'].includes(r)) {
    return 'bg-(--rs-primary-100) text-(--rs-primary-700)';
  }
  return 'bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-600)';
}

// Role badge text — proper casing (Intern | IC | Lead | Admin | Founder);
// 'ceo'/'founder' resolve to "Founder" via the shared rbac helper.
function roleLabel(role: string): string {
  return roleDisplayLabel(role);
}

// ── Live duration ticker ───────────────────────────────────────────────────────

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
  const s = secs % 60;
  // Soft cosmetic cue only: 15h default base. The in-memory presence SSE feed
  // doesn't carry per-user approved hours; enforcement + attendance use the real
  // per-user base, so this badge may lag for users with a non-default allotment.
  const over = isOvertime(weekSecondsBefore + secs);

  const label = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  return (
    <span className={over ? 'text-amber-600' : 'text-green-600'}>
      {over && <span className="font-bold">OT </span>}
      {label}
    </span>
  );
}

// ── User Card ─────────────────────────────────────────────────────────────────

function PersonCard({ user }: { user: PresenceUser }) {
  return (
    <div className="bg-white border border-(--rs-neutral-grey-200) rounded-xl p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
      {/* Avatar + live indicator */}
      <div className="flex items-start justify-between">
        <div className="relative">
          <PersonAvatar name={user.name} photoUrl={user.photoUrl} size={48} />
          {/* Pulsing green dot */}
          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-green-400 border-2 border-white">
            <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-75" />
          </span>
        </div>

        {/* Role badge */}
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${roleColor(user.role)}`}>
          {roleLabel(user.role)}
        </span>
      </div>

      {/* Name + team */}
      <div>
        <p className="font-semibold text-(--rs-neutral-grey-900) text-sm leading-tight">{user.name}</p>
        {user.team && (
          <p className="text-xs text-(--rs-neutral-grey-400) mt-0.5 truncate">{user.team}</p>
        )}
      </div>

      {/* Clock-in details */}
      <div className="border-t border-(--rs-neutral-grey-100) pt-3 space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-(--rs-neutral-grey-400)">Clocked in</span>
          <span className="font-medium text-(--rs-neutral-grey-700)">{sinceLabel(user.clockedInAt)}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-(--rs-neutral-grey-400)">Duration</span>
          <span className="font-semibold tabular-nums">
            <LiveDuration clockedInAt={user.clockedInAt} weekSecondsBefore={user.weekSecondsBefore} />
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function LivePage() {
  const [online, setOnline]     = useState<PresenceUser[]>([]);
  const [connected, setConnected] = useState(false);
  const [booted, setBooted]     = useState(false);

  // Polling replaces what used to be a held-open SSE connection — that kept a
  // Vercel function instance (and its billed provisioned memory) alive for as
  // long as this page stayed open. 2 minutes is plenty for a "who's in" board.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/presence/live');
        if (!res.ok) {
          if (!cancelled) setConnected(false);
          return;
        }
        const data = (await res.json()) as { online: PresenceUser[] };
        if (cancelled) return;
        setOnline(data.online);
        setConnected(true);
        setBooted(true);
      } catch {
        if (!cancelled) setConnected(false);
      }
    }

    void load();
    const id = window.setInterval(() => { void load(); }, 2 * 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  // Sort: clocked in earliest first
  const sorted = [...online].sort(
    (a, b) => new Date(a.clockedInAt).getTime() - new Date(b.clockedInAt).getTime()
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900) flex items-center gap-2">
            Who&apos;s In
          </h1>
          <p className="text-sm text-(--rs-neutral-grey-500) mt-1">
            Real-time view of everyone currently clocked in.
          </p>
        </div>

        {/* Live indicator */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
          connected
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-(--rs-neutral-grey-50) border-(--rs-neutral-grey-200) text-(--rs-neutral-grey-400)'
        }`}>
          {connected ? (
            <>
              <Radio className="w-3.5 h-3.5" />
              Live
            </>
          ) : (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Connecting…
            </>
          )}
        </div>
      </div>

      {/* Count bar */}
      {booted && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-(--rs-neutral-grey-600)">
            {online.length === 0
              ? 'Nobody is clocked in right now.'
              : online.length === 1
              ? '1 person is currently in.'
              : `${online.length} people are currently in.`}
          </span>
          {online.length > 0 && (
            <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">
              {online.length} online
            </span>
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {!booted && (
        <div className="flex items-center gap-2 text-(--rs-neutral-grey-400)">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Connecting to live feed…</span>
        </div>
      )}

      {/* Cards grid */}
      {booted && online.length === 0 && (
        <div className="text-center py-20 text-(--rs-neutral-grey-300)">
          <div className="w-16 h-16 rounded-full bg-(--rs-neutral-grey-100) flex items-center justify-center mx-auto mb-4">
            <Radio className="w-7 h-7 text-(--rs-neutral-grey-300)" />
          </div>
          <p className="text-base font-medium text-(--rs-neutral-grey-400)">No one is clocked in</p>
          <p className="text-sm text-(--rs-neutral-grey-300) mt-1">Clock in using the button in the sidebar to appear here.</p>
        </div>
      )}

      {booted && sorted.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {sorted.map(user => (
            <PersonCard key={user.userId} user={user} />
          ))}
        </div>
      )}
    </div>
  );
}
