'use client';

import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Loader2, LogIn, LogOut } from 'lucide-react';
import { formatDuration, isOvertime, WEEKLY_CAP_SECONDS } from '@/lib/utils';
import { ClockOutReminderBanner } from '@/components/clock-out-reminder-banner';
import { OvertimeGuardrailDialog } from '@/components/overtime-guardrail-dialog';
import { OvertimeStatusBanner } from '@/components/overtime-status-banner';

type WidgetState = 'loading' | 'out' | 'in';
type PendingAction = 'clock-in' | 'clock-out' | null;

function ClockConfirmDialog({
  action,
  noteDraft,
  onNoteChange,
  onCancel,
  onConfirm,
  busy,
  elapsed,
}: {
  action: Exclude<PendingAction, null>;
  noteDraft: string;
  onNoteChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
  elapsed: number;
}) {
  const isClockIn = action === 'clock-in';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
      <div className="w-full max-w-md rounded-2xl border border-(--rs-neutral-grey-200) bg-white shadow-2xl">
        <div className="border-b border-(--rs-neutral-grey-100) px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-yellow-100 p-2 text-yellow-700">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-serif font-semibold text-(--rs-neutral-grey-900)">
                {isClockIn ? 'Confirm Clock-In' : 'Confirm Clock-Out'}
              </h2>
              <p className="mt-1 text-sm text-(--rs-neutral-grey-500)">
                {isClockIn
                  ? 'Double-check before starting your session. This will make you appear as clocked in across the app.'
                  : 'Double-check before ending your current session. This will stop your live timer everywhere.'}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) px-4 py-3 text-sm text-(--rs-neutral-grey-700)">
            {isClockIn ? (
              <p>Starting now will begin a new tracked session immediately.</p>
            ) : (
              <p>Current tracked duration: <span className="font-semibold text-(--rs-neutral-grey-900)">{formatDuration(elapsed)}</span></p>
            )}
          </div>

          <div>
            <label htmlFor="clock-note" className="block text-sm font-medium text-(--rs-neutral-grey-700)">
              {isClockIn ? 'Session note (optional)' : 'Session note'}
            </label>
            <p className="mt-1 text-xs text-(--rs-neutral-grey-400)">
              {isClockIn
                ? 'Add a quick purpose, location, or reminder for this clock-in.'
                : 'Review the note attached to this session before clocking out.'}
            </p>
            <textarea
              id="clock-note"
              value={noteDraft}
              onChange={e => onNoteChange(e.target.value)}
              rows={4}
              maxLength={300}
              readOnly={!isClockIn}
              placeholder={isClockIn ? 'Example: Client meeting in Makati office, finishing API review.' : 'No note saved for this session.'}
              className="mt-2 w-full rounded-lg border border-(--rs-neutral-grey-200) bg-white px-3 py-2 text-sm text-(--rs-neutral-grey-800) outline-none transition-colors focus:border-(--rs-primary-300) focus:ring-3 focus:ring-(--rs-primary-100) disabled:opacity-60 read-only:bg-(--rs-neutral-grey-50) read-only:text-(--rs-neutral-grey-500)"
            />
            <div className="mt-1 text-right text-[10px] text-(--rs-neutral-grey-400)">
              {noteDraft.length}/300
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-(--rs-neutral-grey-100) px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-(--rs-neutral-grey-200) px-3 py-2 text-sm font-medium text-(--rs-neutral-grey-600) transition-colors hover:bg-(--rs-neutral-grey-50) disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 ${
              isClockIn ? 'bg-(--rs-primary-600) hover:bg-(--rs-primary-700)' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : isClockIn ? <LogIn className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
            {isClockIn ? 'Start Clock-In' : 'Confirm Clock-Out'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ClockWidget({
  collapsed = false,
  variant = 'sidebar',
  isExempt = false,
}: {
  collapsed?: boolean;
  variant?: 'sidebar' | 'topbar';
  isExempt?: boolean;
}) {
  const [state, setState] = useState<WidgetState>('loading');
  const [sessionNote, setSessionNote] = useState('');
  const [noteSaved, setNoteSaved] = useState(true);
  const [noteDraft, setNoteDraft] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [weekSecondsBefore, setWeekSecondsBefore] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderIntervalMinutes, setReminderIntervalMinutes] = useState(120);
  const [reminderVisible, setReminderVisible] = useState(false);
  const [overtimeApproved, setOvertimeApproved] = useState(false);
  const [limitDialogVisible, setLimitDialogVisible] = useState(false);
  const [limitWeekTotal, setLimitWeekTotal] = useState(0);
  const [otRequestState, setOtRequestState] = useState<'idle' | 'sending' | 'pending' | 'error'>('idle');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const weekBeforeRef = useRef(0);
  const lastReminderFiredRef = useRef<number>(0);
  const overtimeHandledRef = useRef(false);

  function startTimer(sinceIso: string) {
    if (timerRef.current) clearInterval(timerRef.current);
    const calc = () => Math.max(0, Math.round((Date.now() - new Date(sinceIso).getTime()) / 1000));
    const initial = calc();
    setElapsed(initial);
    elapsedRef.current = initial;
    timerRef.current = setInterval(() => {
      const val = calc();
      setElapsed(val);
      elapsedRef.current = val;
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setElapsed(0);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/presence').then(r => r.json()),
      fetch('/api/profile/me').then(r => r.json()),
    ])
      .then(([presenceData, profileData]: [
        { openSession?: { clockedInAt: string; notes?: string | null } | null; weekSecondsBefore?: number },
        { user?: { reminderEnabled?: boolean; reminderIntervalMinutes?: number } }
      ]) => {
        if (cancelled) return;
        if (profileData.user) {
          setReminderEnabled(profileData.user.reminderEnabled ?? true);
          setReminderIntervalMinutes(profileData.user.reminderIntervalMinutes ?? 120);
        }
        const wsb = presenceData.weekSecondsBefore ?? 0;
        setWeekSecondsBefore(wsb);
        weekBeforeRef.current = wsb;
        if (presenceData.openSession?.clockedInAt) {
          setSessionNote(presenceData.openSession.notes ?? '');
          setNoteSaved(true);
          startTimer(presenceData.openSession.clockedInAt);
          setState('in');
        } else {
          setState('out');
        }
      })
      .catch(() => { if (!cancelled) setState('out'); });
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (state !== 'in' || !reminderEnabled) return;
    const intervalSec = reminderIntervalMinutes * 60;
    const check = () => {
      const n = Math.floor(elapsedRef.current / intervalSec);
      if (n > 0 && n > lastReminderFiredRef.current) {
        lastReminderFiredRef.current = n;
        setReminderVisible(true);
      }
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [state, reminderEnabled, reminderIntervalMinutes]);

  // Overtime guardrail. The 15h weekly cap is hard-enforced server-side; this
  // mirrors it in the browser using the week-to-date total (completed seconds
  // before this session + live elapsed). When it crosses 15h a non-admin is
  // clocked out and shown the request dialog — unless they already hold an
  // active admin approval, in which case the session keeps running under an
  // "On overtime" banner. Admins are exempt (a high safety ceiling still
  // applies server-side).
  useEffect(() => {
    if (state !== 'in') return;
    const check = async () => {
      if (weekBeforeRef.current + elapsedRef.current < WEEKLY_CAP_SECONDS) return;
      if (overtimeHandledRef.current) return;
      overtimeHandledRef.current = true;

      if (isExempt) { setOvertimeApproved(true); return; }

      let approved = false;
      try {
        const r = await fetch('/api/presence/overtime-request');
        const d = (await r.json()) as { request?: { status: string; approved_until: string | null } | null };
        const req = d.request;
        approved = !!req && req.status === 'approved' && !!req.approved_until
          && new Date(req.approved_until).getTime() > Date.now();
      } catch { /* treat as not approved */ }

      if (approved) { setOvertimeApproved(true); return; }

      setLimitWeekTotal(weekBeforeRef.current + elapsedRef.current);
      setLimitDialogVisible(true);
      void confirmClockOut();
    };
    void check();
    const id = setInterval(check, 15_000);
    return () => clearInterval(id);
    // confirmClockOut is a stable function declaration; only fired once at 15h.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, isExempt]);

  async function requestOvertime() {
    setOtRequestState('sending');
    try {
      const res = await fetch('/api/presence/overtime-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('request failed');
      setOtRequestState('pending');
    } catch {
      setOtRequestState('error');
    }
  }

  function dismissReminder() {
    setReminderVisible(false);
  }

  function openClockInConfirm() {
    setError('');
    setNoteDraft(sessionNote);
    setPendingAction('clock-in');
  }

  function openClockOutConfirm() {
    setError('');
    setPendingAction('clock-out');
  }

  function closeConfirm() {
    if (busy) return;
    setPendingAction(null);
  }

  async function confirmClockIn() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/presence/clock-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmed: true, notes: noteDraft }),
      });
      const data = (await res.json()) as { clockedInAt?: string; error?: string; notes?: string | null; noteSaved?: boolean; weekSecondsBefore?: number };
      if (!res.ok) {
        setError(data.error ?? 'Failed to clock in');
        return;
      }

      const ts = data.clockedInAt!;
      const wsb = data.weekSecondsBefore ?? 0;
      setWeekSecondsBefore(wsb);
      weekBeforeRef.current = wsb;
      setSessionNote(data.notes ?? noteDraft.trim());
      setNoteSaved(data.noteSaved ?? true);
      startTimer(ts);
      setState('in');
      setPendingAction(null);
      // Fresh session — re-arm the overtime guardrail.
      overtimeHandledRef.current = false;
      setOvertimeApproved(false);
      setLimitDialogVisible(false);
      setOtRequestState('idle');
    } catch {
      setError('Request failed');
    } finally {
      setBusy(false);
    }
  }

  async function confirmClockOut() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/presence/clock-out', { method: 'POST' });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Failed to clock out');
        return;
      }

      stopTimer();
      setReminderVisible(false);
      lastReminderFiredRef.current = 0;
      setOvertimeApproved(false);
      setSessionNote('');
      setNoteDraft('');
      setNoteSaved(true);
      setState('out');
      setPendingAction(null);
    } catch {
      setError('Request failed');
    } finally {
      setBusy(false);
    }
  }

  const noteHint = state === 'in' && sessionNote
    ? sessionNote
    : state === 'in' && !noteSaved
    ? 'This session is active, but note saving is not available until the database update is applied.'
    : '';

  const inOvertime = state === 'in' && isOvertime(weekSecondsBefore + elapsed);

  const overtimeOverlays = (
    <>
      {state === 'in' && overtimeApproved && (
        <OvertimeStatusBanner
          weekSecondsTotal={weekSecondsBefore + elapsed}
          busy={busy}
          onClockOut={confirmClockOut}
        />
      )}
      {limitDialogVisible && (
        <OvertimeGuardrailDialog
          weekSecondsTotal={limitWeekTotal}
          requestState={otRequestState}
          onRequest={requestOvertime}
          onClose={() => setLimitDialogVisible(false)}
        />
      )}
    </>
  );

  if (variant === 'topbar') {
    return (
      <>
        {overtimeOverlays}
        {state === 'loading' ? (
          <div className="flex items-center gap-1.5 text-(--rs-neutral-grey-400) text-xs">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          </div>
        ) : state === 'in' ? (
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 text-xs font-medium border px-2.5 py-1 rounded-full ${
              inOvertime
                ? 'text-amber-800 bg-amber-50 border-amber-300'
                : 'text-green-700 bg-green-50 border-green-200'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${inOvertime ? 'bg-amber-500' : 'bg-green-500'}`} />
              {inOvertime && <span className="font-semibold">OT</span>}
              {formatDuration(elapsed)}
            </div>
            <button
              onClick={openClockOutConfirm}
              disabled={busy}
              className="flex items-center gap-1 text-xs font-medium text-(--rs-neutral-grey-500) hover:text-red-600 border border-(--rs-neutral-grey-200) hover:border-red-300 px-2.5 py-1 rounded-full transition-colors disabled:opacity-50"
              title={noteHint || 'Clock Out'}
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />}
              <span className="hidden sm:inline">Clock Out</span>
            </button>
          </div>
        ) : (
          <button
            onClick={openClockInConfirm}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-full border border-(--rs-neutral-grey-300) bg-(--rs-neutral-grey-900) px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-(--rs-neutral-grey-800) hover:border-(--rs-neutral-grey-800) disabled:opacity-50"
            title="Clock In"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogIn className="w-3 h-3" />}
            <span className="hidden sm:inline">Clock In</span>
          </button>
        )}
        {state === 'in' && reminderEnabled && reminderVisible && (
          <ClockOutReminderBanner
            elapsedSeconds={elapsed}
            onDismiss={dismissReminder}
            onClockOut={() => { dismissReminder(); openClockOutConfirm(); }}
          />
        )}
        {pendingAction && (
          <ClockConfirmDialog
            action={pendingAction}
            noteDraft={pendingAction === 'clock-in' ? noteDraft : sessionNote}
            onNoteChange={setNoteDraft}
            onCancel={closeConfirm}
            onConfirm={pendingAction === 'clock-in' ? confirmClockIn : confirmClockOut}
            busy={busy}
            elapsed={elapsed}
          />
        )}
      </>
    );
  }

  return (
    <>
      {overtimeOverlays}
      {collapsed ? (
        <button
          onClick={state === 'out' ? openClockInConfirm : openClockOutConfirm}
          disabled={busy || state === 'loading'}
          className={`w-full flex justify-center py-2 transition-colors ${
            state === 'in'
              ? inOvertime ? 'text-amber-400 hover:text-amber-300' : 'text-green-400 hover:text-green-300'
              : 'text-white/40 hover:text-white/80'
          } disabled:opacity-50`}
          title={state === 'in' ? `Clocked in · ${formatDuration(elapsed)}` : 'Clock In'}
        >
          {busy || state === 'loading'
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : state === 'in'
            ? <span className={`w-2 h-2 rounded-full mt-1 ${inOvertime ? 'bg-amber-400' : 'bg-green-400'}`} />
            : <LogIn className="w-4 h-4" />}
        </button>
      ) : (
        <div className="space-y-1">
          {state === 'in' ? (
            <>
              <div className={`flex items-center gap-2 px-3 py-1 text-xs ${inOvertime ? 'text-amber-400' : 'text-green-400'}`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${inOvertime ? 'bg-amber-400' : 'bg-green-400'}`} />
                <span className="font-medium">{inOvertime ? 'Overtime' : 'Clocked in'} · {formatDuration(elapsed)}</span>
              </div>
              {noteHint && (
                <p className="px-3 text-[10px] text-white/50 line-clamp-2">{noteHint}</p>
              )}
              <button
                onClick={openClockOutConfirm}
                disabled={busy}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded-md font-medium text-red-400/80 hover:text-red-300 hover:bg-white/6 transition-colors disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5 shrink-0" />}
                Clock Out
              </button>
            </>
          ) : (
            <button
              onClick={openClockInConfirm}
              disabled={busy}
              className="w-full flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-(--rs-neutral-grey-900) shadow-sm transition-colors hover:bg-(--rs-neutral-grey-100) disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5 shrink-0" />}
              Clock In
            </button>
          )}
          {error && <p className="px-3 text-[10px] text-red-400">{error}</p>}
        </div>
      )}

      {pendingAction && (
        <ClockConfirmDialog
          action={pendingAction}
          noteDraft={pendingAction === 'clock-in' ? noteDraft : sessionNote}
          onNoteChange={setNoteDraft}
          onCancel={closeConfirm}
          onConfirm={pendingAction === 'clock-in' ? confirmClockIn : confirmClockOut}
          busy={busy}
          elapsed={elapsed}
        />
      )}
    </>
  );
}
