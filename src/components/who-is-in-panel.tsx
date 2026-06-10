'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { BellRing, LogOut, Loader2, MessageCircle, Send, X } from 'lucide-react';
import { isOvertime } from '@/lib/utils';
import { PersonAvatar } from '@/components/person-avatar';
import { normalizePingMessage } from '@/lib/presence-ping';
import { playRomegaNotificationSound, unlockNotificationSound } from '@/lib/notification-sound';

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
  | { type: 'clock_out'; userId: number }
  | {
      type: 'user_ping';
      id: string;
      from: {
        userId: number;
        name: string;
        role: string;
        team: string | null;
        photoUrl?: string | null;
      };
      toUserId: number;
      message: string;
      createdAt: string;
      deadlineAt: string;
    }
  | {
      type: 'user_ping_reply';
      id: string;
      pingId: string;
      fromUserId: number;
      toUserId: number;
      responderName: string;
      replyMessage: string;
      acknowledgedAt: string;
    };

type IncomingPing = Extract<SSEEvent, { type: 'user_ping' }>;
type IncomingPingReply = Extract<SSEEvent, { type: 'user_ping_reply' }>;

type PresencePingStatus = 'pending' | 'acknowledged' | 'missed';

type PresencePingRecord = IncomingPing & {
  senderId: number;
  targetUserId: number;
  status: PresencePingStatus;
  acknowledgedAt: string | null;
  missedAt: string | null;
};

type PresencePingUserSummary = {
  userId: number;
  awaitingReplyCount: number;
  acknowledgedReplyCount: number;
  missedReplyCount: number;
  requiresMyReplyCount: number;
  missedMeCount: number;
  nextDeadlineAt: string | null;
  latestMissedAt: string | null;
};

type PresencePingSnapshot = {
  byUserId: Record<number, PresencePingUserSummary>;
  sent: PresencePingRecord[];
  received: PresencePingRecord[];
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function sinceLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function dueLabel(iso: string): string {
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
  currentUserId,
  isAdmin,
  pendingId,
  pingTargetId,
  pingDraft,
  pingingId,
  pingStatus,
  pingSnapshot,
  acknowledgingPingId,
  replyDraftByPingId,
  setPingTargetId,
  setPingDraft,
  setReplyDraftForPing,
  sendPing,
  acknowledgePing,
  forceClockOut,
}: {
  sorted: PresenceUser[];
  connected: boolean;
  currentUserId: number;
  isAdmin: boolean;
  pendingId: number | null;
  pingTargetId: number | null;
  pingDraft: string;
  pingingId: number | null;
  pingStatus: { tone: 'success' | 'error'; message: string } | null;
  pingSnapshot: PresencePingSnapshot;
  acknowledgingPingId: string | null;
  replyDraftByPingId: Record<string, string>;
  setPingTargetId: (id: number | null) => void;
  setPingDraft: (message: string) => void;
  setReplyDraftForPing: (id: string, message: string) => void;
  sendPing: (user: PresenceUser) => void;
  acknowledgePing: (ping: IncomingPing | PresencePingRecord, replyMessage?: string) => void;
  forceClockOut: (user: PresenceUser) => void;
}) {
  const pendingReplies = pingSnapshot.received.filter(p => p.status === 'pending');
  const missedReplies = pingSnapshot.received.filter(p => p.status === 'missed');

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

      {(pendingReplies.length > 0 || missedReplies.length > 0) && (
        <div className="space-y-2 border-b border-(--rs-neutral-grey-100) bg-(--rs-neutral-grey-50) px-4 py-3">
          {pendingReplies.map(ping => (
            <div key={ping.id} className="rounded-lg border border-(--rs-primary-200) bg-white p-2">
              <div className="space-y-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-(--rs-neutral-grey-900)">Reply due by {dueLabel(ping.deadlineAt)}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-(--rs-neutral-grey-500)">
                    {ping.from.name}: {ping.message}
                  </p>
                </div>
                <div className="flex gap-2">
                  <input
                    value={replyDraftByPingId[ping.id] ?? ''}
                    onChange={e => setReplyDraftForPing(ping.id, e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') acknowledgePing(ping, replyDraftByPingId[ping.id]);
                    }}
                    maxLength={160}
                    placeholder="I'm here"
                    className="min-h-8 min-w-0 flex-1 rounded-md border border-(--rs-neutral-grey-200) px-2 text-xs focus:border-(--rs-primary-300) focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => acknowledgePing(ping, replyDraftByPingId[ping.id])}
                    disabled={acknowledgingPingId === ping.id}
                    className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md bg-(--rs-primary-500) px-2 text-xs font-medium text-white disabled:opacity-60"
                  >
                    {acknowledgingPingId === ping.id && <Loader2 className="h-3 w-3 animate-spin" />}
                    Reply
                  </button>
                </div>
              </div>
            </div>
          ))}
          {missedReplies.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
              {missedReplies.length === 1
                ? '1 missed ping mark is on your live status.'
                : `${missedReplies.length} missed ping marks are on your live status.`}
            </div>
          )}
        </div>
      )}

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
              const pinging = pingingId === user.userId;
              const showingPingForm = pingTargetId === user.userId;
              const canPing = user.userId !== currentUserId;
              const pingSummary = pingSnapshot.byUserId[user.userId];
              return (
                <div key={user.userId} className="hover:bg-(--rs-neutral-grey-50)">
                  <div className="group flex items-center gap-3 px-4 py-3">
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
                      {pingSummary && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {pingSummary.requiresMyReplyCount > 0 && (
                            <span className="rounded-full bg-(--rs-primary-50) px-1.5 py-0.5 text-[10px] font-semibold text-(--rs-primary-700)">
                              Reply due
                            </span>
                          )}
                          {pingSummary.awaitingReplyCount > 0 && (
                            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                              Awaiting reply
                            </span>
                          )}
                          {pingSummary.missedReplyCount > 0 && (
                            <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                              Missed ping
                            </span>
                          )}
                          {pingSummary.missedMeCount > 0 && (
                            <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                              Missed reply
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Time */}
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-semibold tabular-nums">
                        <LiveDuration clockedInAt={user.clockedInAt} weekSecondsBefore={user.weekSecondsBefore} />
                      </p>
                      <p className="text-[10px] text-(--rs-neutral-grey-400)">since {sinceLabel(user.clockedInAt)}</p>
                    </div>

                    {canPing && (
                      <button
                        type="button"
                        onClick={() => {
                          setPingTargetId(showingPingForm ? null : user.userId);
                          setPingDraft('');
                        }}
                        title={`Ping ${user.name}`}
                        aria-label={`Ping ${user.name}`}
                        className={`shrink-0 rounded-md p-1.5 transition-colors ${
                          showingPingForm
                            ? 'bg-(--rs-primary-50) text-(--rs-primary-700)'
                            : 'text-(--rs-neutral-grey-400) hover:bg-(--rs-primary-50) hover:text-(--rs-primary-700)'
                        }`}
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                      </button>
                    )}

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

                  {showingPingForm && (
                    <div className="px-4 pb-3">
                      <div className="flex gap-2 rounded-lg border border-(--rs-neutral-grey-200) bg-white p-2">
                        <input
                          value={pingDraft}
                          onChange={e => setPingDraft(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') sendPing(user);
                            if (e.key === 'Escape') setPingTargetId(null);
                          }}
                          placeholder="Are you online?"
                          maxLength={160}
                          className="min-h-9 min-w-0 flex-1 rounded-md border border-transparent px-2 text-xs focus:border-(--rs-primary-300) focus:outline-none"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => sendPing(user)}
                          disabled={pinging}
                          className="inline-flex min-h-9 items-center gap-1 rounded-md bg-(--rs-primary-500) px-3 text-xs font-medium text-white disabled:opacity-50"
                        >
                          {pinging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          Send
                        </button>
                      </div>
                      {pingStatus && (
                        <p className={`mt-1 text-xs ${pingStatus.tone === 'success' ? 'text-green-600' : 'text-red-500'}`}>
                          {pingStatus.message}
                        </p>
                      )}
                    </div>
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

export function WhoIsInPanel({ currentUserId, isAdmin = false }: { currentUserId: number; isAdmin?: boolean }) {
  const [open, setOpen]           = useState(false);
  const [online, setOnline]       = useState<PresenceUser[]>([]);
  const [connected, setConnected] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [pingTargetId, setPingTargetId] = useState<number | null>(null);
  const [pingDraft, setPingDraft] = useState('');
  const [pingingId, setPingingId] = useState<number | null>(null);
  const [pingStatus, setPingStatus] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [incomingPings, setIncomingPings] = useState<IncomingPing[]>([]);
  const [incomingReplies, setIncomingReplies] = useState<IncomingPingReply[]>([]);
  const [replyDraftByPingId, setReplyDraftByPingId] = useState<Record<string, string>>({});
  const [pingSnapshot, setPingSnapshot] = useState<PresencePingSnapshot>({
    byUserId: {},
    sent: [],
    received: [],
  });
  const [acknowledgingPingId, setAcknowledgingPingId] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const loadPingSnapshot = useCallback(async () => {
    try {
      const res = await fetch('/api/presence/ping');
      if (!res.ok) return;
      setPingSnapshot((await res.json()) as PresencePingSnapshot);
    } catch {
      // Presence ping status is an enhancement; keep the live panel usable.
    }
  }, []);

  function setReplyDraftForPing(id: string, message: string) {
    setReplyDraftByPingId(prev => ({ ...prev, [id]: message }));
  }

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

  async function sendPing(user: PresenceUser) {
    setPingingId(user.userId);
    setPingStatus(null);
    await unlockNotificationSound();
    try {
      const message = normalizePingMessage(pingDraft);
      const res = await fetch('/api/presence/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toUserId: user.userId, message }),
      });
      const data = await res.json().catch(() => ({})) as {
        error?: string;
        snapshot?: PresencePingSnapshot;
      };
      if (!res.ok) throw new Error(data.error ?? 'Ping failed');
      if (data.snapshot) setPingSnapshot(data.snapshot);
      setPingStatus({ tone: 'success', message: `Ping sent to ${user.name}. They have 1 hour to reply.` });
      setPingDraft('');
      window.setTimeout(() => {
        setPingTargetId(null);
        setPingStatus(null);
      }, 1600);
    } catch (err) {
      setPingStatus({ tone: 'error', message: err instanceof Error ? err.message : 'Ping failed' });
    } finally {
      setPingingId(null);
    }
  }

  async function acknowledgePing(ping: IncomingPing | PresencePingRecord, replyMessage?: string) {
    setAcknowledgingPingId(ping.id);
    try {
      const res = await fetch('/api/presence/ping/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: ping.id, replyMessage }),
      });
      const data = await res.json().catch(() => ({})) as {
        error?: string;
        snapshot?: PresencePingSnapshot;
      };
      if (!res.ok) throw new Error(data.error ?? 'Could not reply to ping');
      if (data.snapshot) setPingSnapshot(data.snapshot);
      setIncomingPings(prev => prev.filter(p => p.id !== ping.id));
      setReplyDraftByPingId(prev => {
        const next = { ...prev };
        delete next[ping.id];
        return next;
      });
    } catch (err) {
      setPingStatus({ tone: 'error', message: err instanceof Error ? err.message : 'Could not reply to ping' });
      void loadPingSnapshot();
    } finally {
      setAcknowledgingPingId(null);
    }
  }

  // Single SSE connection for both the badge count and the panel list
  useEffect(() => {
    const initialPingStatusTimeout = window.setTimeout(() => {
      void loadPingSnapshot();
    }, 0);
    const pingStatusInterval = window.setInterval(() => {
      void loadPingSnapshot();
    }, 60_000);

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
      } else if (event.type === 'user_ping') {
        setIncomingPings(prev => [event, ...prev.filter(p => p.id !== event.id)].slice(0, 3));
        void loadPingSnapshot();
        playRomegaNotificationSound(4);
        window.setTimeout(() => {
          setIncomingPings(prev => prev.filter(p => p.id !== event.id));
        }, 9000);
      } else if (event.type === 'user_ping_reply') {
        setIncomingReplies(prev => [event, ...prev.filter(p => p.id !== event.id)].slice(0, 3));
        void loadPingSnapshot();
        playRomegaNotificationSound(2);
        window.setTimeout(() => {
          setIncomingReplies(prev => prev.filter(p => p.id !== event.id));
        }, 9000);
      }
    };

    return () => {
      window.clearTimeout(initialPingStatusTimeout);
      window.clearInterval(pingStatusInterval);
      es.close();
      esRef.current = null;
    };
  }, [loadPingSnapshot]);

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
        onClick={() => {
          void unlockNotificationSound();
          setOpen(o => !o);
        }}
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

      {incomingPings.length > 0 && (
        <div className="fixed right-4 top-20 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
          {incomingPings.map(ping => (
            <div
              key={ping.id}
              className="rounded-lg border border-(--rs-primary-200) bg-white p-3 text-left shadow-xl"
            >
              <button
                type="button"
                onClick={() => {
                  setOpen(true);
                  setIncomingPings(prev => prev.filter(p => p.id !== ping.id));
                }}
                className="flex w-full items-start gap-3 text-left"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--rs-primary-50) text-(--rs-primary-700)">
                  <BellRing className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-(--rs-neutral-grey-900)">Ping from {ping.from.name}</span>
                  <span className="mt-0.5 line-clamp-2 block text-xs text-(--rs-neutral-grey-600)">{ping.message}</span>
                  <span className="mt-1 block text-[10px] font-semibold text-amber-700">
                    Reply by {dueLabel(ping.deadlineAt)} to avoid a missed ping mark.
                  </span>
                </span>
              </button>
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => acknowledgePing(ping, replyDraftByPingId[ping.id])}
                  disabled={acknowledgingPingId === ping.id}
                  className="inline-flex min-h-8 items-center gap-1 rounded-md bg-(--rs-primary-500) px-3 text-xs font-medium text-white disabled:opacity-60"
                >
                  {acknowledgingPingId === ping.id && <Loader2 className="h-3 w-3 animate-spin" />}
                  Reply
                </button>
              </div>
              <input
                value={replyDraftByPingId[ping.id] ?? ''}
                onChange={e => setReplyDraftForPing(ping.id, e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') acknowledgePing(ping, replyDraftByPingId[ping.id]);
                }}
                maxLength={160}
                placeholder="I'm here"
                className="mt-2 min-h-8 w-full rounded-md border border-(--rs-neutral-grey-200) px-2 text-xs focus:border-(--rs-primary-300) focus:outline-none"
              />
            </div>
          ))}
        </div>
      )}

      {incomingReplies.length > 0 && (
        <div className="fixed right-4 top-20 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
          {incomingReplies.map(reply => (
            <div
              key={reply.id}
              className="rounded-lg border border-green-200 bg-white p-3 text-left shadow-xl"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-700">
                  <BellRing className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-(--rs-neutral-grey-900)">
                    {reply.responderName} replied
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-xs text-(--rs-neutral-grey-600)">
                    {reply.replyMessage}
                  </span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

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
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            pendingId={pendingId}
            pingTargetId={pingTargetId}
            pingDraft={pingDraft}
            pingingId={pingingId}
            pingStatus={pingStatus}
            pingSnapshot={pingSnapshot}
            acknowledgingPingId={acknowledgingPingId}
            replyDraftByPingId={replyDraftByPingId}
            setPingTargetId={setPingTargetId}
            setPingDraft={setPingDraft}
            setReplyDraftForPing={setReplyDraftForPing}
            sendPing={sendPing}
            acknowledgePing={acknowledgePing}
            forceClockOut={forceClockOut}
          />
        )}
      </div>
    </>
  );
}
