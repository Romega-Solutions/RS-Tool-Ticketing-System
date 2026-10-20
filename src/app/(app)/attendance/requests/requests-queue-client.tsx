'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarClock, Clock, Paperclip, Check, X, CheckCircle2, XCircle, Inbox, ArrowRight, Hourglass,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export type QueueRequest = {
  id:                  number;
  requesterName:       string;
  isOwn:               boolean;
  date:                string;
  currentClockIn:      string | null;
  currentClockOut:     string | null;
  requestedClockIn:    string | null;
  requestedClockOut:   string | null;
  reason:              string;
  documentName:        string | null;
  documentUrl:         string | null;
  status:              'pending' | 'approved' | 'denied' | 'cancelled';
  stage:               'supervisor' | 'admin' | 'done';
  stageLabel:          string;
  /** Which step the viewer would decide as; null when they can't act. */
  actAs:               'supervisor' | 'admin' | null;
  requestedAt:         string;
  supervisorName:      string | null;
  supervisorDecision:  'approved' | 'denied' | null;
  supervisorNote:      string | null;
  supervisorDecidedAt: string | null;
  decidedAt:           string | null;
  decisionComment:     string | null;
  decidedByName:       string | null;
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

// Who decided each step, shown under the request.
function StepTrail({ r }: { r: QueueRequest }) {
  const lines: { label: string; tone: 'ok' | 'no' | 'info'; note: string | null }[] = [];
  if (r.supervisorDecision) {
    lines.push({
      label: `Supervisor${r.supervisorName ? ` (${r.supervisorName})` : ''} ${r.supervisorDecision === 'approved' ? 'approved' : 'declined'}${r.supervisorDecidedAt ? ` · ${fmtWhen(r.supervisorDecidedAt)}` : ''}`,
      tone: r.supervisorDecision === 'approved' ? 'ok' : 'no',
      note: r.supervisorNote,
    });
  }
  // The final decision, when an admin made it (a supervisor rejection is
  // already shown above).
  if (r.stage === 'done' && r.supervisorDecision !== 'denied' && (r.status === 'approved' || r.status === 'denied')) {
    lines.push({
      label: `${r.supervisorDecision ? 'Admin' : 'Decided'}${r.decidedByName ? ` (${r.decidedByName})` : ''} ${r.status === 'approved' ? 'approved' : 'declined'}${r.decidedAt ? ` · ${fmtWhen(r.decidedAt)}` : ''}`,
      tone: r.status === 'approved' ? 'ok' : 'no',
      note: r.decisionComment,
    });
  }
  if (!lines.length) return null;
  return (
    <div className="space-y-1">
      {lines.map((l, i) => (
        <p key={i} className="text-xs text-(--rs-neutral-grey-600)">
          <span className={l.tone === 'ok' ? 'font-medium text-green-700' : l.tone === 'no' ? 'font-medium text-red-700' : 'font-medium'}>{l.label}</span>
          {l.note ? <>: <span className="whitespace-pre-wrap">{l.note}</span></> : null}
        </p>
      ))}
    </div>
  );
}

function StageBadge({ r }: { r: QueueRequest }) {
  const cls = r.stage === 'supervisor'
    ? 'bg-(--rs-accent-50) text-(--rs-accent-700)'
    : r.stage === 'admin'
      ? 'bg-(--rs-primary-50) text-(--rs-primary-700)'
      : r.status === 'approved' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700';
  const Icon = r.stage === 'done' ? (r.status === 'approved' ? CheckCircle2 : XCircle) : Hourglass;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      <Icon className="h-3 w-3" /> {r.stageLabel}
    </span>
  );
}

function waitingNote(r: QueueRequest): string {
  if (r.isOwn) return r.stage === 'supervisor' ? 'Your request: waiting for your supervisor' : 'Your request: waiting for an admin';
  if (r.stage === 'admin') return 'Waiting for an admin to decide';
  return `Waiting for ${r.supervisorName ?? 'the supervisor'}`;
}

export function RequestsQueueClient({ requests, canDecide = true, isAdmin = false }: { requests: QueueRequest[]; canDecide?: boolean; isAdmin?: boolean }) {
  const router = useRouter();
  const [busyId, setBusyId]     = useState<number | null>(null);
  const [decision, setDecision] = useState<{ id: number; action: 'approve' | 'deny' } | null>(null);
  const [comment, setComment]   = useState('');
  const [error, setError]       = useState<string | null>(null);

  const pending = requests.filter(r => r.status === 'pending');
  const decided = requests.filter(r => r.status !== 'pending');
  // What the viewer can act on comes first.
  const actionable = pending.filter(r => r.actAs);
  const waiting    = pending.filter(r => !r.actAs);

  async function decide(id: number, action: 'approve' | 'deny', cmt: string) {
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
      setDecision(null); setComment('');
      router.refresh();
    } catch {
      setError('Network error — please try again.');
    } finally {
      setBusyId(null);
    }
  }

  const renderCard = (r: QueueRequest) => {
    const open = decision?.id === r.id ? decision : null;
    const finalStep = r.actAs === 'admin';
    return (
      <Card key={r.id}><CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm font-semibold text-(--rs-neutral-grey-900)">{r.requesterName}</span>
          <span className="inline-flex items-center gap-1 text-sm text-(--rs-neutral-grey-500)">
            <CalendarClock className="h-3.5 w-3.5" /> {fmtDate(r.date)}
          </span>
          <StageBadge r={r} />
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

        <StepTrail r={r} />

        {!r.actAs ? (
          <p className="text-xs font-medium text-(--rs-accent-700)">{waitingNote(r)}</p>
        ) : open ? (
          <div className={`space-y-2 rounded-lg border p-3 ${open.action === 'deny' ? 'border-red-200 bg-red-50/50' : 'border-green-200 bg-green-50/50'}`}>
            <label htmlFor={`note-${r.id}`} className="block text-xs font-medium text-(--rs-neutral-grey-700)">
              {open.action === 'deny' ? 'Reason for declining' : 'Approval note (one word is fine)'} <span className="text-red-600">*</span>
            </label>
            <textarea
              id={`note-${r.id}`} rows={2} value={comment} maxLength={1000} onChange={e => setComment(e.target.value)}
              placeholder={open.action === 'deny' ? 'Tell the requester why this is being declined…' : 'e.g. Confirmed'}
              className="block w-full rounded-lg border border-(--rs-neutral-grey-200) bg-white px-3 py-2 text-sm outline-none focus:border-(--rs-primary-300) focus:ring-4 focus:ring-(--rs-primary-100)"
            />
            <p className="text-[11px] text-(--rs-neutral-grey-500)">
              {open.action === 'deny'
                ? 'Declining is final; the timesheet stays as it is.'
                : finalStep
                  ? 'Approving applies the new times to the timesheet.'
                  : 'Approving sends this to an admin for the final decision.'}
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant={open.action === 'deny' ? 'destructive' : 'default'}
                      disabled={busyId === r.id || !comment.trim()}
                      onClick={() => decide(r.id, open.action, comment.trim())} className="gap-1.5">
                {open.action === 'deny' ? <><X className="h-3.5 w-3.5" /> Confirm decline</> : <><Check className="h-3.5 w-3.5" /> Confirm approval</>}
              </Button>
              <Button size="sm" variant="outline" disabled={busyId === r.id}
                      onClick={() => { setDecision(null); setComment(''); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busyId === r.id}
                    onClick={() => { setDecision({ id: r.id, action: 'approve' }); setComment(''); setError(null); }} className="gap-1.5">
              <Check className="h-3.5 w-3.5" /> Approve
            </Button>
            <Button size="sm" variant="outline" disabled={busyId === r.id}
                    onClick={() => { setDecision({ id: r.id, action: 'deny' }); setComment(''); setError(null); }} className="gap-1.5">
              <X className="h-3.5 w-3.5" /> Decline
            </Button>
            <span className="text-xs text-(--rs-neutral-grey-500)">
              {finalStep
                ? (r.stage === 'supervisor' ? 'As an admin, your decision is final.' : 'Final step')
                : 'Step 1 of 2 · an admin decides next'}
            </span>
          </div>
        )}
      </CardContent></Card>
    );
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif text-2xl font-semibold text-(--rs-neutral-grey-900)">Time Approvals</h1>
        <p className="mt-1 text-sm text-(--rs-neutral-grey-500)">
          {isAdmin
            ? 'Clock-time corrections go to the requester’s supervisor first, then to an admin. Only an admin approval changes the timesheet. Every decision needs a note.'
            : canDecide
              ? 'Review clock-time corrections from the people who report to you. Your approval sends a request to an admin for the final decision; declining is final. Every decision needs a note.'
              : 'Track the status of the clock-time corrections you’ve submitted for approval.'}
        </p>
      </header>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {canDecide && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-(--rs-neutral-grey-500)">
            Needs your decision ({actionable.length})
          </h2>
          {actionable.length === 0 ? (
            <Card><CardContent className="p-8 text-center">
              <Inbox className="mx-auto mb-2 h-6 w-6 text-(--rs-neutral-grey-300)" />
              <p className="text-sm text-(--rs-neutral-grey-500)">Nothing needs your decision. You’re all caught up.</p>
            </CardContent></Card>
          ) : actionable.map(renderCard)}
        </section>
      )}

      {(waiting.length > 0 || !canDecide) && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-(--rs-neutral-grey-500)">
            {canDecide ? 'Waiting on others' : 'Pending'} ({waiting.length})
          </h2>
          {waiting.length === 0 ? (
            <Card><CardContent className="p-8 text-center">
              <Inbox className="mx-auto mb-2 h-6 w-6 text-(--rs-neutral-grey-300)" />
              <p className="text-sm text-(--rs-neutral-grey-500)">No pending requests.</p>
            </CardContent></Card>
          ) : waiting.map(renderCard)}
        </section>
      )}

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
                  <span className="ml-auto"><StageBadge r={r} /></span>
                </div>
                {r.supervisorDecision || r.decisionComment ? (
                  <StepTrail r={r} />
                ) : (
                  <p className="text-xs text-(--rs-neutral-grey-500)">
                    {r.decidedByName ? `by ${r.decidedByName}` : ''}{r.decidedAt ? ` · ${fmtWhen(r.decidedAt)}` : ''}
                  </p>
                )}
              </div>
            ))}
          </CardContent></Card>
        </section>
      )}
    </div>
  );
}
