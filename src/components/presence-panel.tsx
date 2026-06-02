'use client';

import { useState, useEffect, useRef } from 'react';
import { Users } from 'lucide-react';
import { isOvertime } from '@/lib/utils';

type PresenceUser = {
  userId:      number;
  name:        string;
  role:        string;
  team:        string | null;
  clockedInAt: string;
  weekSecondsBefore?: number;
};

type SSEEvent =
  | { type: 'snapshot'; online: PresenceUser[] }
  | { type: 'clock_in';  user: PresenceUser }
  | { type: 'clock_out'; userId: number };

function initials(name: string): string {
  return name.split(' ').map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2);
}

function sinceLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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
    <span className={`text-xs ${over ? 'font-semibold text-amber-600' : 'text-(--rs-neutral-grey-400)'}`}>
      {over ? `OT ${label}` : label}
    </span>
  );
}

export function PresencePanel() {
  const [online, setOnline] = useState<PresenceUser[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource('/api/presence/stream');
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (e) => {
      const event = JSON.parse(e.data as string) as SSEEvent;
      if (event.type === 'snapshot') {
        setOnline(event.online);
        setConnected(true);
      } else if (event.type === 'clock_in') {
        setOnline(prev => {
          const exists = prev.some(u => u.userId === event.user.userId);
          return exists ? prev.map(u => u.userId === event.user.userId ? event.user : u) : [...prev, event.user];
        });
      } else if (event.type === 'clock_out') {
        setOnline(prev => prev.filter(u => u.userId !== event.userId));
      }
    };

    return () => { es.close(); esRef.current = null; };
  }, []);

  return (
    <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-(--rs-neutral-grey-100)">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-(--rs-neutral-grey-400)" />
          <span className="text-sm font-serif font-semibold text-(--rs-neutral-grey-900)">Who&apos;s In</span>
          {online.length > 0 && (
            <span className="bg-green-100 text-green-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
              {online.length}
            </span>
          )}
        </div>
        <span
          className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
            connected
              ? 'bg-green-50 text-green-600'
              : 'bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-400)'
          }`}
        >
          {connected ? 'Live' : 'Connecting…'}
        </span>
      </div>

      <div className="divide-y divide-(--rs-neutral-grey-100)">
        {online.length === 0 ? (
          <p className="px-4 py-5 text-sm text-(--rs-neutral-grey-400) italic text-center">
            No one is clocked in right now.
          </p>
        ) : (
          online.map(user => (
            <div key={user.userId} className="flex items-center gap-3 px-4 py-3">
              <div className="w-8 h-8 rounded-full bg-(--rs-primary-100) text-(--rs-primary-700) flex items-center justify-center text-xs font-bold shrink-0">
                {initials(user.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-(--rs-neutral-grey-900) truncate">{user.name}</div>
                <div className="text-xs text-(--rs-neutral-grey-400)">since {sinceLabel(user.clockedInAt)}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <LiveDuration clockedInAt={user.clockedInAt} weekSecondsBefore={user.weekSecondsBefore} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
