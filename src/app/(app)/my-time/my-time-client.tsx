'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, AlertTriangle, Pencil, CheckCircle2, XCircle, Hourglass, Paperclip, CalendarClock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';

export type MySession = {
  id:                number;
  date:              string;
  clockedInAt:       string;
  clockedOutAt:      string | null;
  durationSeconds:   number | null;
  editedAt:          string | null;
  hasPendingRequest: boolean;
};

export type MyRequest = {
  id:                number;
  timesheetId:       number | null;
  date:              string;
  currentClockIn:    string | null;
  currentClockOut:   string | null;
  requestedClockIn:  string | null;
  requestedClockOut: string | null;
  reason:            string;
  documentName:      string | null;
  status:            'pending' | 'approved' | 'denied' | 'cancelled';
  requestedAt:       string;
  decidedAt:         string | null;
  decisionComment:   string | null;
};

// ── formatting helpers ──────────────────────────────────────────────────────
function fmtDate(date: string) {
  const d = new Date(date + 'T00:00:00');
  return isNaN(d.getTime()) ? date : d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtTime(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}
function fmtDuration(s: number | null) {
  if (s == null) return '—';
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS_BADGE: Record<MyRequest['status'], { label: string; cls: string; Icon: typeof Hourglass }> = {
  pending:   { label: 'Pending',  cls: 'bg-(--rs-accent-50) text-(--rs-accent-700)',          Icon: Hourglass },
  approved:  { label: 'Approved', cls: 'bg-green-50 text-green-700',                            Icon: CheckCircle2 },
  denied:    { label: 'Declined', cls: 'bg-red-50 text-red-700',                                Icon: XCircle },
  cancelled: { label: 'Cancelled',cls: 'bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-600)', Icon: XCircle },
};

function TabButton({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'border-(--rs-primary-500) text-(--rs-primary-600)'
          : 'border-transparent text-(--rs-neutral-grey-500) hover:text-(--rs-neutral-grey-700) hover:border-(--rs-neutral-grey-300)'
      }`}
    >
      {label}
      {count != null && count > 0 && (
        <span className="ml-2 inline-flex items-center justify-center rounded-full bg-(--rs-accent-100) px-1.5 text-[11px] font-semibold text-(--rs-accent-700)">
          {count}
        </span>
      )}
    </button>
  );
}

export function MyTimeClient({ sessions, requests }: { sessions: MySession[]; requests: MyRequest[] }) {
  const router = useRouter();
  const [active, setActive] = useState<MySession | null>(null);
  const [tab, setTab] = useState<'logins' | 'requests'>('logins');

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-2xl font-semibold text-(--rs-neutral-grey-900)">My Time</h1>
        <p className="mt-1 text-sm text-(--rs-neutral-grey-500)">
          Your clock-in history and time-correction requests.
        </p>
      </header>

      {/* Tabs */}
      <div className="flex gap-0.5 border-b border-(--rs-neutral-grey-200)">
        <TabButton active={tab === 'logins'} onClick={() => setTab('logins')} label="Logins" />
        <TabButton active={tab === 'requests'} onClick={() => setTab('requests')} label="Time Request" count={pendingCount} />
      </div>

      {/* ── LOGINS ─────────────────────────────────────────────────────────── */}
      {tab === 'logins' && (
        <section className="space-y-3">
          <p className="text-sm text-(--rs-neutral-grey-500)">
            Your recent clock sessions. Spot a mistake? Click “Request correction” and your team lead will review it.
          </p>
          {sessions.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-(--rs-neutral-grey-500)">
              No clock sessions in the last few weeks.
            </CardContent></Card>
          ) : (
            <Card><CardContent className="p-0 divide-y divide-(--rs-neutral-grey-100)">
              {sessions.map(s => (
                <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                  <div className="w-28 shrink-0">
                    <div className="text-sm font-semibold text-(--rs-neutral-grey-900)">{fmtDate(s.date)}</div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-(--rs-neutral-grey-700)">
                    <Clock className="h-3.5 w-3.5 text-(--rs-neutral-grey-400)" />
                    {fmtTime(s.clockedInAt)} <span className="text-(--rs-neutral-grey-400)">→</span> {fmtTime(s.clockedOutAt)}
                  </div>
                  <div className="text-sm text-(--rs-neutral-grey-500) tabular-nums">{fmtDuration(s.durationSeconds)}</div>
                  <div className="ml-auto flex items-center gap-2">
                    {s.editedAt && (
                      <span className="inline-flex items-center rounded-full bg-(--rs-primary-50) px-2 py-0.5 text-[11px] font-medium text-(--rs-primary-700)">Edited</span>
                    )}
                    {s.hasPendingRequest ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-(--rs-accent-50) px-2 py-0.5 text-[11px] font-medium text-(--rs-accent-700)">
                        <Hourglass className="h-3 w-3" /> Request pending
                      </span>
                    ) : (
                      <Button
                        variant="outline" size="sm" className="gap-1.5"
                        onClick={() => setActive(s)}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Request correction
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent></Card>
          )}
        </section>
      )}

      {/* ── TIME REQUEST ───────────────────────────────────────────────────── */}
      {tab === 'requests' && (
        <section className="space-y-3">
          <p className="text-sm text-(--rs-neutral-grey-500)">
            Corrections you’ve submitted. To file a new one, open the{' '}
            <button type="button" onClick={() => setTab('logins')} className="font-medium text-(--rs-primary-600) underline-offset-2 hover:underline">Logins</button>{' '}
            tab and click “Request correction” on the session.
          </p>
          {requests.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-(--rs-neutral-grey-500)">
              You haven’t submitted any time-correction requests yet.
            </CardContent></Card>
          ) : (
            <Card><CardContent className="p-0 divide-y divide-(--rs-neutral-grey-100)">
              {requests.map(r => {
                const b = STATUS_BADGE[r.status];
                return (
                  <div key={r.id} className="px-4 py-3.5 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <CalendarClock className="h-3.5 w-3.5 text-(--rs-neutral-grey-400)" />
                      <span className="text-sm font-semibold text-(--rs-neutral-grey-900)">{fmtDate(r.date)}</span>
                      <span className="text-sm text-(--rs-neutral-grey-600)">
                        {fmtTime(r.requestedClockIn ?? r.currentClockIn)} <span className="text-(--rs-neutral-grey-400)">→</span> {fmtTime(r.requestedClockOut ?? r.currentClockOut)}
                      </span>
                      <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${b.cls}`}>
                        <b.Icon className="h-3 w-3" /> {b.label}
                      </span>
                    </div>
                    <p className="text-sm text-(--rs-neutral-grey-600)">{r.reason}</p>
                    {r.documentName && (
                      <p className="inline-flex items-center gap-1 text-xs text-(--rs-neutral-grey-500)">
                        <Paperclip className="h-3 w-3" /> {r.documentName}
                      </p>
                    )}
                    {r.status === 'denied' && r.decisionComment && (
                      <p className="rounded-md bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
                        <strong>Lead’s note:</strong> {r.decisionComment}
                      </p>
                    )}
                  </div>
                );
              })}
            </CardContent></Card>
          )}
        </section>
      )}

      {active && (
        <RequestModal
          session={active}
          onClose={() => setActive(null)}
          onSaved={() => { setActive(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function RequestModal({ session, onClose, onSaved }: { session: MySession; onClose: () => void; onSaved: () => void }) {
  const originalIn  = toLocalInput(session.clockedInAt);
  const originalOut = toLocalInput(session.clockedOutAt);
  const [inVal, setInVal]   = useState(originalIn);
  const [outVal, setOutVal] = useState(originalOut);
  const [reason, setReason] = useState('');
  const [file, setFile]     = useState<File | null>(null);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!reason.trim()) { setError('Please provide a detailed reason.'); return; }
    const changedIn  = inVal !== originalIn;
    const changedOut = outVal !== originalOut;
    if (!changedIn && !changedOut) { setError('Adjust the clock-in and/or clock-out time first.'); return; }

    const fd = new FormData();
    fd.set('timesheetId', String(session.id));
    fd.set('reason', reason.trim());
    if (changedIn)  fd.set('requestedClockIn',  inVal  ? new Date(inVal).toISOString()  : '');
    if (changedOut) fd.set('requestedClockOut', outVal ? new Date(outVal).toISOString() : '');
    if (file) fd.set('document', file);

    setBusy(true);
    try {
      const res = await fetch('/api/presence/time-edit-request', { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json.error ?? 'Could not submit your request.'); setBusy(false); return; }
      onSaved();
    } catch {
      setError('Network error — please try again.');
      setBusy(false);
    }
  }

  const inputCls = 'h-11 w-full rounded-xl border border-(--rs-neutral-grey-200) bg-white px-3 text-sm text-(--rs-neutral-grey-800) outline-none transition-all focus:border-(--rs-primary-300) focus:ring-4 focus:ring-(--rs-primary-100)';

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Request a time correction</DialogTitle>
          <DialogDescription>For {fmtDate(session.date)} · current {fmtTime(session.clockedInAt)} → {fmtTime(session.clockedOutAt)}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {/* Disclaimer */}
          <div className="flex items-start gap-2.5 rounded-lg border border-(--rs-accent-200) bg-(--rs-accent-50) p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-(--rs-accent-700)" />
            <p className="text-xs leading-relaxed text-(--rs-accent-800)">
              <strong>Important:</strong> Provide a highly detailed reason and upload supporting documentation where applicable.
              Vague, incomplete, or unexplained requests will be subject to disapproval by your lead.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="te-in" className="text-(--rs-neutral-grey-700) font-medium">Corrected clock-in</Label>
              <input id="te-in" type="datetime-local" value={inVal} onChange={e => setInVal(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="te-out" className="text-(--rs-neutral-grey-700) font-medium">Corrected clock-out</Label>
              <input id="te-out" type="datetime-local" value={outVal} onChange={e => setOutVal(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="te-reason" className="text-(--rs-neutral-grey-700) font-medium">Reason <span className="text-red-600">*</span></Label>
            <textarea
              id="te-reason" required rows={4} value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Explain exactly what happened and why the recorded time is wrong…"
              className="block w-full rounded-xl border border-(--rs-neutral-grey-200) bg-white px-3 py-2 text-sm text-(--rs-neutral-grey-800) outline-none transition-all focus:border-(--rs-primary-300) focus:ring-4 focus:ring-(--rs-primary-100)"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="te-doc" className="text-(--rs-neutral-grey-700) font-medium">Supporting document <span className="text-(--rs-neutral-grey-400)">(optional)</span></Label>
            <input
              id="te-doc" type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/heic"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-(--rs-neutral-grey-600) file:mr-3 file:rounded-lg file:border-0 file:bg-(--rs-primary-50) file:px-3 file:py-2 file:text-sm file:font-medium file:text-(--rs-primary-700) hover:file:bg-(--rs-primary-100)"
            />
            <p className="text-xs text-(--rs-neutral-grey-400)">Screenshot, medical cert, outage ticket, etc. PDF or image, up to 10 MB.</p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy} className="gap-2">
              {busy ? (<><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Submitting…</>) : 'Submit request'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
