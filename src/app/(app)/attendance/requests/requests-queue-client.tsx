'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarClock, Clock, Paperclip, Check, X, CheckCircle2, XCircle, Inbox, ArrowRight,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export type QueueRequest = {
  id:                number;
  requesterName:     string;
  date:              string;
  currentClockIn:    string | null;
  currentClockOut:   string | null;
  requestedClockIn:  string | null;
  requestedClockOut: string | null;
  reason:            string;
  documentName:      string | null;
  documentUrl:       string | null;
  status:            'pending' | 'approved' | 'denied' | 'cancelled';
  requestedAt:       string;
  decidedAt:         string | null;
  decisionComment:   string | null;
  decidedByName:     string | null;
};

function fmtDate(date: string) {
  const d = new Date(date + 'T00:00:00');
  return isNaN(d.getTime()) ? date : d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtTime(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}
function fmtWhen(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// One side of the in→out change. Highlights when a new value was requested.
function TimeCell({ label, current, requested }: { label: string; current: string | null; requested: string | null }) {
  const changed = requested != null;
  return (
    <div className="text-sm">
      <span className="text-[11px] uppercase tracking-wide text-(--rs-neutral-grey-400)">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={changed ? 'text-(--rs-neutral-grey-400) line-through' : 'text-(--rs-neutral-grey-800)'}>{fmtTime(current)}</span>
        {changed && (
          <>
            <ArrowRight className="h-3 w-3 text-(--rs-neutral-grey-400)" />
            <span className="font-semibold text-(--rs-primary-700)">{fmtTime(requested)}</span>
          </>
        )}
      </div>
    </div>
  );
}

export function RequestsQueueClient({ requests }: { requests: QueueRequest[] }) {
  const router = useRouter();
  const [busyId, setBusyId]   = useState<number | null>(null);
  const [denyId, setDenyId]   = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError]     = useState<string | null>(null);

  const pending = requests.filter(r => r.status === 'pending');
  const decided = requests.filter(r => r.status !== 'pending');

  async function decide(id: number, action: 'approve' | 'deny', cmt?: string) {
    setError(null);
    setBusyId(id);
    try {
      const res = await fetch('/api/attendance/edit-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, comment: cmt }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? 'Could not save decision.'); setBusyId(null); return; }
      setDenyId(null); setComment('');
      router.refresh();
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif text-2xl font-semibold text-(--rs-neutral-grey-900)">Time-correction requests</h1>
        <p className="mt-1 text-sm text-(--rs-neutral-grey-500)">
          Review clock-time corrections from your team. Approving applies the new times to the timesheet; declining requires a reason.
        </p>
      </header>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* Pending */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-(--rs-neutral-grey-500)">
          Pending ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <Card><CardContent className="p-8 text-center">
            <Inbox className="mx-auto mb-2 h-6 w-6 text-(--rs-neutral-grey-300)" />
            <p className="text-sm text-(--rs-neutral-grey-500)">No pending requests. You’re all caught up.</p>
          </CardContent></Card>
        ) : pending.map(r => (
          <Card key={r.id}><CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-sm font-semibold text-(--rs-neutral-grey-900)">{r.requesterName}</span>
              <span className="inline-flex items-center gap-1 text-sm text-(--rs-neutral-grey-500)">
                <CalendarClock className="h-3.5 w-3.5" /> {fmtDate(r.date)}
              </span>
              <span className="ml-auto text-xs text-(--rs-neutral-grey-400)">filed {fmtWhen(r.requestedAt)}</span>
            </div>

            <div className="flex flex-wrap items-center gap-6 rounded-lg bg-(--rs-neutral-grey-50) px-3 py-2.5">
              <Clock className="h-4 w-4 text-(--rs-neutral-grey-400)" />
              <TimeCell label="Clock-in"  current={r.currentClockIn}  requested={r.requestedClockIn} />
              <TimeCell label="Clock-out" current={r.currentClockOut} requested={r.requestedClockOut} />
            </div>

            <p className="text-sm text-(--rs-neutral-grey-700) whitespace-pre-wrap">{r.reason}</p>

            {r.documentUrl && (
              <a href={r.documentUrl} target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-1.5 text-sm font-medium text-(--rs-primary-600) hover:text-(--rs-primary-700) hover:underline">
                <Paperclip className="h-3.5 w-3.5" /> {r.documentName ?? 'View attachment'}
              </a>
            )}

            {denyId === r.id ? (
              <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-3">
                <label htmlFor={`deny-${r.id}`} className="block text-xs font-medium text-(--rs-neutral-grey-700)">
                  Reason for declining <span className="text-red-600">*</span>
                </label>
                <textarea
                  id={`deny-${r.id}`} rows={2} value={comment} onChange={e => setComment(e.target.value)}
                  placeholder="Tell the requester why this is being declined…"
                  className="block w-full rounded-lg border border-(--rs-neutral-grey-200) bg-white px-3 py-2 text-sm outline-none focus:border-(--rs-primary-300) focus:ring-4 focus:ring-(--rs-primary-100)"
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="destructive" disabled={busyId === r.id || !comment.trim()}
                          onClick={() => decide(r.id, 'deny', comment.trim())} className="gap-1.5">
                    <X className="h-3.5 w-3.5" /> Confirm decline
                  </Button>
                  <Button size="sm" variant="outline" disabled={busyId === r.id}
                          onClick={() => { setDenyId(null); setComment(''); }}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button size="sm" disabled={busyId === r.id} onClick={() => decide(r.id, 'approve')} className="gap-1.5">
                  <Check className="h-3.5 w-3.5" /> Approve
                </Button>
                <Button size="sm" variant="outline" disabled={busyId === r.id}
                        onClick={() => { setDenyId(r.id); setComment(''); setError(null); }} className="gap-1.5">
                  <X className="h-3.5 w-3.5" /> Decline
                </Button>
              </div>
            )}
          </CardContent></Card>
        ))}
      </section>

      {/* Decided history */}
      {decided.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-(--rs-neutral-grey-500)">Recently decided</h2>
          <Card><CardContent className="p-0 divide-y divide-(--rs-neutral-grey-100)">
            {decided.map(r => (
              <div key={r.id} className="px-4 py-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-(--rs-neutral-grey-900)">{r.requesterName}</span>
                  <span className="text-sm text-(--rs-neutral-grey-500)">{fmtDate(r.date)}</span>
                  <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    r.status === 'approved' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                  }`}>
                    {r.status === 'approved' ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    {r.status === 'approved' ? 'Approved' : 'Declined'}
                  </span>
                </div>
                <p className="text-xs text-(--rs-neutral-grey-500)">
                  {r.decidedByName ? `by ${r.decidedByName}` : ''}{r.decidedAt ? ` · ${fmtWhen(r.decidedAt)}` : ''}
                </p>
                {r.status === 'denied' && r.decisionComment && (
                  <p className="text-xs text-(--rs-neutral-grey-600)"><strong>Note:</strong> {r.decisionComment}</p>
                )}
              </div>
            ))}
          </CardContent></Card>
        </section>
      )}
    </div>
  );
}
