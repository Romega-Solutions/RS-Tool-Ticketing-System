'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, AtSign, FolderPlus, CalendarClock, CheckCheck, Timer } from 'lucide-react';
import { playRomegaNotificationSound } from '@/lib/notification-sound';

type NotificationItem = {
  id:         number;
  type:       string;
  title:      string;
  body:       string | null;
  link:       string | null;
  is_read:    number;
  created_at: string;
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function TypeIcon({ type }: { type: string }) {
  const cls = 'w-4 h-4';
  if (type === 'mentioned')    return <AtSign className={cls} />;
  if (type === 'project_added') return <FolderPlus className={cls} />;
  if (type === 'task_due')     return <CalendarClock className={cls} />;
  if (type === 'time_edit_requested' || type === 'time_edit_decided') return <Timer className={cls} />;
  return <Bell className={cls} />;
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen]     = useState(false);
  const [items, setItems]   = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);

  const prevUnread = useRef(0);
  const loaded     = useRef(false);
  const wrapRef    = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json() as { items: NotificationItem[]; unreadCount: number };
      setItems(data.items ?? []);
      setUnread(data.unreadCount ?? 0);
      // Chime only when the unread count rises after the initial baseline load.
      if (loaded.current && data.unreadCount > prevUnread.current) {
        playRomegaNotificationSound();
      }
      prevUnread.current = data.unreadCount ?? 0;
      loaded.current = true;
    } catch {
      /* offline / transient — keep the last good state */
    }
  }, []);

  useEffect(() => {
    // Defer the first fetch out of the synchronous effect body, then poll.
    const initial = setTimeout(load, 0);
    const t = setInterval(load, 60_000);
    return () => { clearTimeout(initial); clearInterval(t); };
  }, [load]);

  function toggleOpen() {
    setOpen(o => !o);
    void load(); // refresh on interaction (handler — safe to setState)
  }

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function markRead(id: number) {
    setItems(prev => prev.map(n => (n.id === id ? { ...n, is_read: 1 } : n)));
    setUnread(u => Math.max(0, u - 1));
    prevUnread.current = Math.max(0, prevUnread.current - 1);
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }

  async function markAll() {
    setItems(prev => prev.map(n => ({ ...n, is_read: 1 })));
    setUnread(0);
    prevUnread.current = 0;
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
  }

  function onItemClick(n: NotificationItem) {
    if (!n.is_read) void markRead(n.id);
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  const badge = unread > 9 ? '9+' : String(unread);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label={unread > 0 ? `${unread} unread notifications` : 'Notifications'}
        onClick={toggleOpen}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl text-(--rs-neutral-grey-500) transition-colors hover:bg-(--rs-neutral-grey-100) hover:text-(--rs-neutral-grey-800)"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-(--rs-accent-500) px-1 text-[10px] font-bold leading-none text-white">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-(--rs-neutral-grey-200) bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-(--rs-neutral-grey-100) px-4 py-2.5">
            <span className="font-serif text-sm font-bold text-(--rs-neutral-grey-900)">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="inline-flex items-center gap-1 text-xs font-medium text-(--rs-primary-600) hover:text-(--rs-primary-700)"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-(--rs-neutral-grey-400)">
                You&apos;re all caught up.
              </div>
            ) : (
              <ul className="divide-y divide-(--rs-neutral-grey-100)">
                {items.map(n => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => onItemClick(n)}
                      className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-(--rs-neutral-grey-50) ${
                        n.is_read ? '' : 'bg-(--rs-primary-50)/50'
                      }`}
                    >
                      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        n.is_read
                          ? 'bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-500)'
                          : 'bg-(--rs-primary-100) text-(--rs-primary-600)'
                      }`}>
                        <TypeIcon type={n.type} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-sm font-medium leading-snug text-(--rs-neutral-grey-900)">
                            {n.title}
                          </span>
                          {!n.is_read && (
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-(--rs-accent-500)" />
                          )}
                        </span>
                        {n.body && (
                          <span className="mt-0.5 block truncate text-xs text-(--rs-neutral-grey-600)">
                            {n.body}
                          </span>
                        )}
                        <span className="mt-0.5 block text-[11px] text-(--rs-neutral-grey-400)">
                          {relativeTime(n.created_at)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
