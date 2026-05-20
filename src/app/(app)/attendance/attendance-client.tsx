'use client';

import { Fragment, useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { AttendanceExportSheet } from '@/components/attendance-export-sheet';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Loader2, Clock, Search, X, Pencil, LogOut, Save, Trash2, ShieldCheck } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

type DayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
type WeekdayLabel = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

interface AttendanceRecord {
  id: number; userId: number; weekStart: string;
  mondayStatus: string | null; tuesdayStatus: string | null;
  wednesdayStatus: string | null; thursdayStatus: string | null;
  fridayStatus: string | null; saturdayStatus: string | null; sundayStatus: string | null;
  notes: string | null; submittedAt: string | null;
}

interface TeamUser { id: number; name: string; team: string | null; role: string; memberCode?: string | null; hourlyRateUsd?: number | null; }

interface MonthlySummary {
  userId: number; name: string; team: string | null; role: string;
  hourlyRateUsd?: number | null;
  present: number; wfh: number; leave: number; absent: number; workdays: number;
  weekendWork: number; totalSeconds: number;
}

interface TimesheetEntry {
  id: number;
  date: string;
  clockedInAt: string;
  clockedOutAt: string | null;
  durationSeconds: number | null;
  isOvertime?: boolean;
  overtimeSeconds?: number | null;
}

interface DetailDay {
  key: string;
  label: WeekdayLabel;
  date: string;
  status: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DAY_KEYS: DayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: Record<DayKey, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri',
  saturday: 'Sat', sunday: 'Sun',
};

const STATUS_OPTS = [
  { value: 'present', label: 'Present', color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'wfh',     label: 'WFH',     color: 'bg-blue-100 text-blue-700 border-blue-300'   },
  { value: 'leave',   label: 'Leave',   color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'absent',  label: 'Absent',  color: 'bg-red-100 text-red-700 border-red-300'      },
];

function fmtSeconds(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function statusColor(val: string | null): string {
  return STATUS_OPTS.find(o => o.value === (val ?? ''))?.color
    ?? 'bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-500) border-(--rs-neutral-grey-200)';
}
function statusLabel(val: string | null): string {
  return STATUS_OPTS.find(o => o.value === (val ?? ''))?.label ?? '—';
}

function detailDayStatusLabel(day: DetailDay): string {
  if (day.status) return statusLabel(day.status);
  if (day.label === 'Sat' || day.label === 'Sun') return 'Weekend';
  return '—';
}

// ── Avatar / today helpers ─────────────────────────────────────────────────────

const AVATAR_PALETTE = [
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-indigo-100 text-indigo-700',
  'bg-orange-100 text-orange-700',
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function MemberAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs';
  return (
    <div className={`shrink-0 rounded-full flex items-center justify-center font-semibold ${sizeClass} ${avatarColor(name)}`}>
      {getInitials(name)}
    </div>
  );
}

function isSameLocalDay(iso: string, ref: Date): boolean {
  const y = ref.getFullYear();
  const m = String(ref.getMonth() + 1).padStart(2, '0');
  const d = String(ref.getDate()).padStart(2, '0');
  return iso === `${y}-${m}-${d}`;
}

// ── Date helpers ───────────────────────────────────────────────────────────────

function getMondayDate(offset = 0): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow) + offset * 7);
  return d;
}

function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getCurrentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function offsetMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── Timesheet Detail Row ───────────────────────────────────────────────────────

function TimesheetDetailPanel({
  userId, weekStart, detailDays, notes, isAdmin, onChanged,
}: {
  userId: number;
  weekStart: string;
  detailDays: DetailDay[];
  notes: string | null;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [adminBusy, setAdminBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editIn,    setEditIn]    = useState('');
  const [editOut,   setEditOut]   = useState('');
  const [dayDraft,  setDayDraft]  = useState<Record<string, string | null>>(
    () => Object.fromEntries(detailDays.map(d => [d.key, d.status])),
  );
  const [notesDraft, setNotesDraft] = useState(notes ?? '');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/timesheets?userId=${userId}&week=${weekStart}`)
      .then(r => r.json())
      .then((d: { timesheets?: TimesheetEntry[]; error?: string }) => {
        if (cancelled) return;
        if (d.error) { setError(d.error); return; }
        setEntries(d.timesheets ?? []);
      })
      .catch(() => { if (!cancelled) setError('Failed to load timesheet data.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, weekStart, reloadKey]);

  function toLocalInputValue(iso: string): string {
    // <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in *local* time.
    const d = new Date(iso);
    const y  = d.getFullYear();
    const m  = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${dd}T${hh}:${mi}`;
  }

  function startEditTimes(entry: TimesheetEntry) {
    setEditingId(entry.id);
    setEditIn(toLocalInputValue(entry.clockedInAt));
    setEditOut(entry.clockedOutAt ? toLocalInputValue(entry.clockedOutAt) : '');
  }

  async function saveTimes(id: number) {
    if (!editIn) { alert('Clock-in time is required'); return; }
    setAdminBusy(true);
    try {
      const res = await fetch('/api/admin/timesheets', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          id,
          clockedInAt:  new Date(editIn).toISOString(),
          clockedOutAt: editOut ? new Date(editOut).toISOString() : null,
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Update failed');
      setEditingId(null);
      setReloadKey(k => k + 1);
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setAdminBusy(false);
    }
  }

  async function deleteEntry(id: number) {
    if (!confirm('Delete this clock-in session? This cannot be undone.')) return;
    setAdminBusy(true);
    try {
      const res = await fetch(`/api/admin/timesheets?id=${id}`, { method: 'DELETE' });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      setReloadKey(k => k + 1);
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setAdminBusy(false);
    }
  }

  async function forceClockOut(userIdToClose: number) {
    if (!confirm("Force clock-out this user's open session now?")) return;
    setAdminBusy(true);
    try {
      const res = await fetch('/api/admin/timesheets/force-clock-out', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ userId: userIdToClose }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Force clock-out failed');
      setReloadKey(k => k + 1);
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Force clock-out failed');
    } finally {
      setAdminBusy(false);
    }
  }

  async function saveAttendance() {
    setAdminBusy(true);
    try {
      const res = await fetch('/api/admin/attendance', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          userId, weekStart,
          monday:    dayDraft.monday    ?? '',
          tuesday:   dayDraft.tuesday   ?? '',
          wednesday: dayDraft.wednesday ?? '',
          thursday:  dayDraft.thursday  ?? '',
          friday:    dayDraft.friday    ?? '',
          saturday:  dayDraft.saturday  ?? '',
          sunday:    dayDraft.sunday    ?? '',
          notes:     notesDraft,
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      onChanged();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setAdminBusy(false);
    }
  }

  if (loading) {
    return (
      <tr>
        <td colSpan={10} className="px-4 py-3 bg-(--rs-neutral-grey-50)">
          <div className="flex items-center gap-2 text-(--rs-neutral-grey-400) text-xs">
            <Loader2 className="w-3 h-3 animate-spin" />
            Loading clock-in details…
          </div>
        </td>
      </tr>
    );
  }

  if (error) {
    return (
      <tr>
        <td colSpan={10} className="px-4 py-3 bg-red-50">
          <p className="text-xs text-red-600">{error}</p>
        </td>
      </tr>
    );
  }

  // Group entries by date
  const byDate: Record<string, TimesheetEntry[]> = {};
  for (const e of entries) {
    (byDate[e.date] ??= []).push(e);
  }

  return (
    <tr>
      <td colSpan={10} className="bg-(--rs-neutral-grey-50) border-b border-(--rs-neutral-grey-100)">
        <div className="px-4 py-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_2fr]">
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-(--rs-neutral-grey-600) uppercase tracking-wider">Attendance status</p>
                  {isAdmin && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-(--rs-primary-50) px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-(--rs-primary-700)">
                      <ShieldCheck className="w-2.5 h-2.5" /> Admin edit
                    </span>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
                  {detailDays.map(day => {
                    const draftVal = dayDraft[day.key] ?? '';
                    return (
                      <div key={day.key} className="rounded border border-(--rs-neutral-grey-200) bg-white px-2.5 py-2">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-(--rs-neutral-grey-400)">
                          {day.label} {new Date(day.date + 'T00:00:00').getDate()}
                        </div>
                        {isAdmin ? (
                          <select
                            value={draftVal ?? ''}
                            onChange={e => setDayDraft(prev => ({ ...prev, [day.key]: e.target.value || null }))}
                            disabled={adminBusy}
                            className={`mt-1 w-full rounded border text-xs font-medium px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-(--rs-primary-100) ${statusColor(draftVal)}`}
                          >
                            <option value="">—</option>
                            {STATUS_OPTS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        ) : (
                          <div className={`mt-1 inline-block rounded border px-2 py-0.5 text-xs font-medium ${statusColor(day.status)}`}>
                            {detailDayStatusLabel(day)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-(--rs-neutral-grey-600) uppercase tracking-wider">Notes</p>
                {isAdmin ? (
                  <textarea
                    value={notesDraft}
                    onChange={e => setNotesDraft(e.target.value)}
                    disabled={adminBusy}
                    rows={3}
                    placeholder="Reason for adjustment, leave context, etc."
                    className="mt-2 w-full rounded border border-(--rs-neutral-grey-200) bg-white px-3 py-2 text-xs text-(--rs-neutral-grey-700) outline-none focus:border-(--rs-primary-300) focus:ring-2 focus:ring-(--rs-primary-100)"
                  />
                ) : (
                  <div className="mt-2 rounded border border-(--rs-neutral-grey-200) bg-white px-3 py-2 text-xs text-(--rs-neutral-grey-600)">
                    {notes?.trim() ? (
                      <p className="whitespace-pre-line">{notes}</p>
                    ) : (
                      <p className="italic text-(--rs-neutral-grey-400)">No attendance notes recorded for this week.</p>
                    )}
                  </div>
                )}
                {isAdmin && (
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" onClick={saveAttendance} disabled={adminBusy} className="gap-1.5">
                      {adminBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Save attendance
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Clock className="w-3 h-3 text-(--rs-neutral-grey-400)" />
                <span className="text-xs font-semibold text-(--rs-neutral-grey-600) uppercase tracking-wider">Clock-in / Clock-out log</span>
              </div>
              {entries.length === 0 ? (
                <p className="text-xs text-(--rs-neutral-grey-400) italic">No clock-in sessions recorded this week.</p>
              ) : (
                <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-7">
                  {detailDays.map(day => {
                    const daySessions = byDate[day.date] ?? [];
                    return (
                      <div key={day.key} className="space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-(--rs-neutral-grey-400)">
                          {day.label} {new Date(day.date + 'T00:00:00').getDate()}
                        </p>
                        {daySessions.length === 0 ? (
                          <p className="text-xs text-(--rs-neutral-grey-300)">—</p>
                        ) : (
                          daySessions.map(s => {
                            const isEditing = editingId === s.id;
                            return (
                              <div key={s.id} className="bg-white border border-(--rs-neutral-grey-200) rounded px-2 py-1.5 space-y-0.5">
                                {isEditing ? (
                                  <div className="space-y-1.5">
                                    <label className="block text-[10px] text-(--rs-neutral-grey-500) font-semibold">
                                      Clock-in
                                      <input
                                        type="datetime-local"
                                        value={editIn}
                                        onChange={e => setEditIn(e.target.value)}
                                        className="mt-0.5 block w-full rounded border border-(--rs-neutral-grey-200) px-1.5 py-0.5 text-[11px]"
                                      />
                                    </label>
                                    <label className="block text-[10px] text-(--rs-neutral-grey-500) font-semibold">
                                      Clock-out
                                      <input
                                        type="datetime-local"
                                        value={editOut}
                                        onChange={e => setEditOut(e.target.value)}
                                        className="mt-0.5 block w-full rounded border border-(--rs-neutral-grey-200) px-1.5 py-0.5 text-[11px]"
                                      />
                                    </label>
                                    <div className="flex gap-1 pt-0.5">
                                      <button
                                        type="button"
                                        onClick={() => saveTimes(s.id)}
                                        disabled={adminBusy}
                                        className="flex-1 inline-flex items-center justify-center gap-1 rounded bg-(--rs-primary-600) px-2 py-1 text-[10px] font-semibold text-white hover:bg-(--rs-primary-700) disabled:opacity-50"
                                      >
                                        {adminBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingId(null)}
                                        disabled={adminBusy}
                                        className="rounded border border-(--rs-neutral-grey-200) px-2 py-1 text-[10px] font-semibold text-(--rs-neutral-grey-600) hover:bg-(--rs-neutral-grey-100) disabled:opacity-50"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-center gap-1 text-xs text-green-700 font-medium">
                                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                                      In: {fmtTime(s.clockedInAt)}
                                    </div>
                                    {s.clockedOutAt ? (
                                      <div className="flex items-center gap-1 text-xs text-red-600 font-medium">
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                                        Out: {fmtTime(s.clockedOutAt)}
                                      </div>
                                    ) : (
                                      <div className="text-xs text-orange-500 font-medium">Still clocked in</div>
                                    )}
                                    {s.durationSeconds != null && (
                                      <div className="text-[10px] text-(--rs-neutral-grey-400)">{fmtSeconds(s.durationSeconds)}</div>
                                    )}
                                    {s.isOvertime && (
                                      <div className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                                        OT{s.overtimeSeconds ? ` +${fmtSeconds(s.overtimeSeconds)}` : ''}
                                      </div>
                                    )}
                                    {isAdmin && (
                                      <div className="flex items-center gap-1 pt-1 border-t border-(--rs-neutral-grey-100) mt-1">
                                        <button
                                          type="button"
                                          onClick={() => startEditTimes(s)}
                                          disabled={adminBusy}
                                          title="Edit clock-in / clock-out"
                                          className="rounded p-1 text-(--rs-neutral-grey-500) hover:bg-(--rs-primary-50) hover:text-(--rs-primary-700) transition-colors"
                                        >
                                          <Pencil className="w-3 h-3" />
                                        </button>
                                        {!s.clockedOutAt && (
                                          <button
                                            type="button"
                                            onClick={() => forceClockOut(userId)}
                                            disabled={adminBusy}
                                            title="Force clock-out now"
                                            className="rounded p-1 text-orange-500 hover:bg-orange-50 hover:text-orange-700 transition-colors"
                                          >
                                            <LogOut className="w-3 h-3" />
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => deleteEntry(s.id)}
                                          disabled={adminBusy}
                                          title="Delete entry"
                                          className="ml-auto rounded p-1 text-(--rs-neutral-grey-400) hover:bg-red-50 hover:text-red-600 transition-colors"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function AttendanceClient({ isAdmin = false }: { isAdmin?: boolean }) {
  const [activeTab, setActiveTab] = useState<'weekly' | 'monthly'>('weekly');
  const [weekRefreshKey, setWeekRefreshKey] = useState(0);

  // Weekly state
  const [weekOffset, setWeekOffset] = useState(0);
  const monday = getMondayDate(weekOffset);
  const sunday = new Date(monday.getTime() + 6 * 86400000);
  const weekStart = toLocalISO(monday);
  const weekdayDates    = DAY_KEYS.map((_, i) => new Date(monday.getTime() + i * 86400000).getDate());
  const weekdayDateStrs = DAY_KEYS.map((_, i) => toLocalISO(new Date(monday.getTime() + i * 86400000)));

  const [weekLoading,      setWeekLoading]      = useState(true);
  const [weekError,        setWeekError]         = useState('');
  const [teamUsers,        setTeamUsers]         = useState<TeamUser[]>([]);
  const [teamRecords,      setTeamRecords]       = useState<AttendanceRecord[]>([]);
  const [timesheetsByDay,  setTimesheetsByDay]   = useState<Record<string, number>>({});
  const [fx,               setFx]                = useState<{ rate: number; label: string } | null>(null);

  // Which user row is expanded to show clock-in detail
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);

  // Search + pagination (shared shape for weekly & monthly)
  const [weeklySearch, setWeeklySearch] = useState('');
  const [weeklyPage,   setWeeklyPage]   = useState(1);
  const [monthlySearch, setMonthlySearch] = useState('');
  const [monthlyPage,   setMonthlyPage]   = useState(1);
  const PAGE_SIZE = 10;
  const today = new Date();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/attendance?week=${weekStart}`)
      .then(r => r.json())
      .then((d: { users?: TeamUser[]; records?: AttendanceRecord[]; timesheetsByDay?: Record<string, number>; error?: string }) => {
        if (cancelled) return;
        if (d.error) { setWeekError(d.error); return; }
        setTeamUsers(d.users ?? []);
        setTeamRecords(d.records ?? []);
        setTimesheetsByDay(d.timesheetsByDay ?? {});
      })
      .catch(() => { if (!cancelled) setWeekError('Failed to load attendance data.'); })
      .finally(() => { if (!cancelled) setWeekLoading(false); });
    return () => { cancelled = true; };
  }, [weekStart, weekRefreshKey]);

  // Live USD→PHP rate for the payroll timesheet export.
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const res  = await fetch('/api/fx/usd-php', { cache: 'no-store' });
        const data = await res.json() as { rate?: number; fetchedAt?: string; stale?: boolean };
        if (cancelled || !res.ok || typeof data.rate !== 'number') return;
        const when = data.fetchedAt
          ? new Date(data.fetchedAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
          : 'unknown time';
        setFx({ rate: data.rate, label: `${data.stale ? 'cached' : 'live'} · as of ${when}` });
      } catch { /* leave fx null — export falls back to USD only */ }
    };
    void pull();
    const id = setInterval(pull, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Monthly state
  const [month, setMonth] = useState(getCurrentYearMonth());
  const [monthLoading, setMonthLoading] = useState(false);
  const [monthError,   setMonthError]   = useState('');
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary[]>([]);
  const [monthWorkdays,  setMonthWorkdays]  = useState(0);

  const weeklyExportRows = teamUsers.map(user => {
    const rec = teamRecords.find(r => r.userId === user.id);
    const weekSeconds = weekdayDateStrs.reduce((sum, date) => sum + (timesheetsByDay[`${user.id}:${date}`] ?? 0), 0);
    const saturdaySeconds = timesheetsByDay[`${user.id}:${weekdayDateStrs[5]}`] ?? 0;
    const sundaySeconds = timesheetsByDay[`${user.id}:${weekdayDateStrs[6]}`] ?? 0;

    return {
      member: user.name,
      team: user.team ?? '',
      monday: rec?.mondayStatus ?? '',
      tuesday: rec?.tuesdayStatus ?? '',
      wednesday: rec?.wednesdayStatus ?? '',
      thursday: rec?.thursdayStatus ?? '',
      friday: rec?.fridayStatus ?? '',
      saturday: rec?.saturdayStatus ?? '',
      sunday: rec?.sundayStatus ?? '',
      saturday_hours: fmtSeconds(saturdaySeconds),
      sunday_hours: fmtSeconds(sundaySeconds),
      week_total_hours: fmtSeconds(weekSeconds),
      notes: rec?.notes ?? '',
    };
  });

  // Structured per-day hours for the Romega Weekly Timesheet template.
  const timesheetMemberRows = teamUsers.map(user => {
    const daySeconds = weekdayDateStrs.map(date => timesheetsByDay[`${user.id}:${date}`] ?? 0);
    return {
      name: user.name,
      memberCode: user.memberCode ?? '',
      daySeconds,
      weekSeconds: daySeconds.reduce((a, b) => a + b, 0),
      hourlyRateUsd: user.hourlyRateUsd ?? null,
    };
  });

  // Member name → USD gross for the week (tracked hours × rate), null if no rate.
  const weeklyWiseAmounts: Record<string, number | null> = Object.fromEntries(
    timesheetMemberRows.map(r => [
      r.name,
      r.hourlyRateUsd != null ? (r.weekSeconds / 3600) * r.hourlyRateUsd : null,
    ]),
  );
  const timesheetMeta = {
    weekRangeLabel:
      `${monday.getDate()} ${monday.toLocaleDateString('en-US', { month: 'short' })} ${monday.getFullYear()}`
      + ` - ${sunday.getDate()} ${sunday.toLocaleDateString('en-US', { month: 'short' })} ${sunday.getFullYear()}`,
    dayDateLabels: DAY_KEYS.map((_, i) =>
      new Date(monday.getTime() + i * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    ),
  };

  const monthlyExportRows = monthlySummary.map(row => ({
    member: row.name,
    team: row.team ?? '',
    present: row.present,
    wfh: row.wfh,
    leave: row.leave,
    absent: row.absent,
    weekend_work_days: row.weekendWork,
    tracked_days: row.present + row.wfh + row.leave + row.absent,
    workdays: monthWorkdays,
    total_hours: fmtSeconds(row.totalSeconds),
  }));

  // Member name → USD gross for the month (tracked hours × rate), null if no rate.
  const monthlyWiseAmounts: Record<string, number | null> = Object.fromEntries(
    monthlySummary.map(row => [
      row.name,
      row.hourlyRateUsd != null ? (row.totalSeconds / 3600) * row.hourlyRateUsd : null,
    ]),
  );

  useEffect(() => {
    if (activeTab !== 'monthly') return;

    let cancelled = false;
    fetch(`/api/attendance?month=${month}`)
      .then(r => r.json())
      .then((d: { summary?: MonthlySummary[]; workdays?: number; error?: string }) => {
        if (cancelled) return;
        if (d.error) { setMonthError(d.error); return; }
        setMonthlySummary(d.summary ?? []);
        setMonthWorkdays(d.workdays ?? 0);
      })
      .catch(() => { if (!cancelled) setMonthError('Failed to load monthly data.'); })
      .finally(() => { if (!cancelled) setMonthLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, month]);

  function changeWeekOffset(updater: number | ((value: number) => number)) {
    setWeekLoading(true);
    setWeekError('');
    setExpandedUserId(null);
    setWeeklyPage(1);
    setWeekOffset(updater);
  }

  function changeMonth(updater: string | ((value: string) => string)) {
    setMonthLoading(true);
    setMonthError('');
    setMonthlyPage(1);
    setMonth(updater);
  }

  // Filtered & paginated rows for the weekly tab
  const filteredWeeklyUsers = useMemo(() => {
    const q = weeklySearch.trim().toLowerCase();
    if (!q) return teamUsers;
    return teamUsers.filter(u =>
      u.name.toLowerCase().includes(q) || (u.team ?? '').toLowerCase().includes(q),
    );
  }, [teamUsers, weeklySearch]);

  const weeklyTotalPages = Math.max(1, Math.ceil(filteredWeeklyUsers.length / PAGE_SIZE));
  const weeklyPageSafe   = Math.min(weeklyPage, weeklyTotalPages);
  const pagedWeeklyUsers = filteredWeeklyUsers.slice(
    (weeklyPageSafe - 1) * PAGE_SIZE,
    weeklyPageSafe * PAGE_SIZE,
  );

  // Filtered & paginated rows for the monthly tab
  const filteredMonthly = useMemo(() => {
    const q = monthlySearch.trim().toLowerCase();
    if (!q) return monthlySummary;
    return monthlySummary.filter(r =>
      r.name.toLowerCase().includes(q) || (r.team ?? '').toLowerCase().includes(q),
    );
  }, [monthlySummary, monthlySearch]);

  const monthlyTotalPages = Math.max(1, Math.ceil(filteredMonthly.length / PAGE_SIZE));
  const monthlyPageSafe   = Math.min(monthlyPage, monthlyTotalPages);
  const pagedMonthly      = filteredMonthly.slice(
    (monthlyPageSafe - 1) * PAGE_SIZE,
    monthlyPageSafe * PAGE_SIZE,
  );

  function activateTab(tab: 'weekly' | 'monthly') {
    if (tab === 'monthly') {
      setMonthLoading(true);
      setMonthError('');
    }
    setActiveTab(tab);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">Attendance</h1>
        <p className="text-(--rs-neutral-grey-500) text-sm mt-1">
          Team attendance tracking for Romega Solutions.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0.5 border-b border-(--rs-neutral-grey-200)">
        {(['weekly', 'monthly'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => activateTab(tab)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
              activeTab === tab
                ? 'border-(--rs-primary-500) text-(--rs-primary-600)'
                : 'border-transparent text-(--rs-neutral-grey-500) hover:text-(--rs-neutral-grey-700) hover:border-(--rs-neutral-grey-300)'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── WEEKLY TAB ─────────────────────────────────────────────────────────── */}
      {activeTab === 'weekly' && (
        <>
          {/* Week navigator */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" size="icon" onClick={() => changeWeekOffset(w => w - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium text-(--rs-neutral-grey-900) min-w-44 text-center">
              {fmtDate(monday)} – {fmtDate(sunday)}
            </span>
            <Button variant="outline" size="icon" onClick={() => changeWeekOffset(w => w + 1)} disabled={weekOffset >= 0}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            {weekOffset !== 0 && (
              <Button variant="ghost" size="sm" onClick={() => changeWeekOffset(0)} className="text-(--rs-primary-500) text-sm">
                This Week
              </Button>
            )}
            <div className="ml-auto">
              <AttendanceExportSheet
                mode="weekly"
                baseName={`attendance_week_${weekStart}`}
                rows={weeklyExportRows}
                jsonMeta={{ weekStart, weekEnd: toLocalISO(sunday) }}
                rangeLabel={`${fmtDate(monday)} – ${fmtDate(sunday)}, ${sunday.getFullYear()}`}
                timesheet={{ rows: timesheetMemberRows, meta: timesheetMeta }}
                wisePaymentReference={`Payroll Period ${fmtDate(monday)} - ${fmtDate(sunday)}`}
                wiseAmounts={weeklyWiseAmounts}
                fx={fx ?? undefined}
              />
            </div>
          </div>

          {weekError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">{weekError}</div>
          )}

          {weekLoading ? (
            <div className="flex items-center gap-2 text-(--rs-neutral-grey-500) py-8">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading attendance data…</span>
            </div>
          ) : (
            <div className="rounded-lg border border-(--rs-neutral-grey-100) bg-white">
              {/* Search bar */}
              <div className="px-4 py-3 border-b border-(--rs-neutral-grey-100)">
                <div className="relative max-w-xs">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-(--rs-neutral-grey-400)" />
                  <input
                    type="text"
                    value={weeklySearch}
                    onChange={e => { setWeeklySearch(e.target.value); setWeeklyPage(1); }}
                    placeholder="Search member or team…"
                    className="w-full rounded-md border border-(--rs-neutral-grey-200) bg-white pl-8 pr-7 py-1.5 text-sm placeholder:text-(--rs-neutral-grey-400) focus:outline-none focus:border-(--rs-primary-500) focus:ring-2 focus:ring-(--rs-primary-100)"
                  />
                  {weeklySearch && (
                    <button
                      type="button"
                      onClick={() => { setWeeklySearch(''); setWeeklyPage(1); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-(--rs-neutral-grey-400) hover:text-(--rs-neutral-grey-700) hover:bg-(--rs-neutral-grey-100)"
                      aria-label="Clear search"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[920px]">
                  <thead>
                    <tr className="border-b border-(--rs-neutral-grey-100) bg-(--rs-neutral-grey-50)/40">
                      <th className="w-6 py-3" />
                      <th className="text-left py-3 pl-2 pr-4 font-medium text-(--rs-neutral-grey-500) text-xs uppercase tracking-wide">Member</th>
                      {DAY_KEYS.map((day, i) => {
                        const isTodayCol = isSameLocalDay(weekdayDateStrs[i], today);
                        return (
                          <th key={day} className="text-center py-3 px-2 font-medium w-24">
                            <div className={`text-xs uppercase tracking-wide ${isTodayCol ? 'text-(--rs-primary-600) font-bold' : 'text-(--rs-neutral-grey-500)'}`}>
                              {DAY_LABELS[day][0]}
                            </div>
                            <div className={`text-xs font-normal mt-0.5 ${isTodayCol ? 'text-(--rs-primary-600) font-bold' : 'text-(--rs-neutral-grey-400)'}`}>
                              {weekdayDates[i]}
                            </div>
                          </th>
                        );
                      })}
                      <th className="text-center py-3 px-4 font-medium text-(--rs-neutral-grey-500) text-xs uppercase tracking-wide w-24">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedWeeklyUsers.map(user => {
                      const rec = teamRecords.find(r => r.userId === user.id);
                      const weekSeconds = weekdayDateStrs.reduce((sum, d) => sum + (timesheetsByDay[`${user.id}:${d}`] ?? 0), 0);
                      const isExpanded = expandedUserId === user.id;
                      const detailDays: DetailDay[] = DAY_KEYS.map((dayKey, index) => ({
                        key: dayKey,
                        label: DAY_LABELS[dayKey] as WeekdayLabel,
                        date: weekdayDateStrs[index],
                        status: rec ? (rec[`${dayKey}Status` as keyof AttendanceRecord] as string | null) : null,
                      }));
                      return (
                        <Fragment key={user.id}>
                          <tr
                            className={`border-b border-(--rs-neutral-grey-100) hover:bg-(--rs-neutral-grey-50)/60 cursor-pointer transition-colors ${isExpanded ? 'bg-(--rs-neutral-grey-50)/60' : ''}`}
                            onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
                          >
                            <td className="py-4 pl-3 align-middle">
                              {isExpanded
                                ? <ChevronUp className="w-3.5 h-3.5 text-(--rs-neutral-grey-400)" />
                                : <ChevronDown className="w-3.5 h-3.5 text-(--rs-neutral-grey-400)" />}
                            </td>
                            <td className="py-4 pl-2 pr-4 align-middle">
                              <div className="flex items-center gap-3">
                                <MemberAvatar name={user.name} />
                                <div className="min-w-0">
                                  <div className="font-medium text-(--rs-neutral-grey-900) truncate">{user.name}</div>
                                  {user.team && <div className="text-xs text-(--rs-neutral-grey-400) truncate">{user.team}</div>}
                                </div>
                              </div>
                            </td>
                            {DAY_KEYS.map((day, i) => {
                              const val  = rec ? (rec[`${day}Status` as keyof AttendanceRecord] as string | null) : null;
                              const secs = timesheetsByDay[`${user.id}:${weekdayDateStrs[i]}`] ?? 0;
                              const isWeekend = day === 'saturday' || day === 'sunday';
                              const isRestDay = isWeekend && !val && secs === 0;
                              const isTodayCol = isSameLocalDay(weekdayDateStrs[i], today);
                              return (
                                <td key={day} className={`text-center py-4 px-2 align-middle ${isTodayCol ? 'bg-(--rs-primary-50)/30' : ''}`}>
                                  {isRestDay ? (
                                    <span className="inline-block w-full rounded bg-(--rs-neutral-grey-200) text-(--rs-neutral-grey-500) text-[10px] font-medium px-2 py-1">
                                      Rest day
                                    </span>
                                  ) : (
                                    <>
                                      {val ? (
                                        <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${statusColor(val)}`}>
                                          {statusLabel(val)}
                                        </span>
                                      ) : (
                                        <span className="text-(--rs-neutral-grey-300) text-sm">—</span>
                                      )}
                                      {secs > 0 && (
                                        <div className="text-[11px] text-(--rs-neutral-grey-500) mt-1">{fmtSeconds(secs)}</div>
                                      )}
                                    </>
                                  )}
                                </td>
                              );
                            })}
                            <td className="text-center py-4 px-4 align-middle">
                              {weekSeconds > 0
                                ? <span className="text-sm font-semibold text-(--rs-neutral-grey-900)">{fmtSeconds(weekSeconds)}</span>
                                : <span className="text-(--rs-neutral-grey-300) text-sm">—</span>}
                            </td>
                          </tr>
                          {isExpanded && (
                            <TimesheetDetailPanel
                              key={`${user.id}-${weekStart}-${weekRefreshKey}`}
                              userId={user.id}
                              weekStart={weekStart}
                              detailDays={detailDays}
                              notes={rec?.notes ?? null}
                              isAdmin={isAdmin}
                              onChanged={() => setWeekRefreshKey(k => k + 1)}
                            />
                          )}
                        </Fragment>
                      );
                    })}
                    {filteredWeeklyUsers.length === 0 && (
                      <tr>
                        <td colSpan={10} className="text-center py-10 text-(--rs-neutral-grey-400) italic text-sm">
                          {weeklySearch ? 'No members match your search.' : 'No team members found.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {filteredWeeklyUsers.length > 0 && (
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-(--rs-neutral-grey-100) text-xs text-(--rs-neutral-grey-500)">
                  <span>
                    Showing {(weeklyPageSafe - 1) * PAGE_SIZE + 1}–{Math.min(weeklyPageSafe * PAGE_SIZE, filteredWeeklyUsers.length)} of {filteredWeeklyUsers.length}
                  </span>
                  <Pagination page={weeklyPageSafe} totalPages={weeklyTotalPages} onChange={p => { setWeeklyPage(p); setExpandedUserId(null); }} />
                </div>
              )}

              <p className="px-4 py-2.5 text-[11px] text-(--rs-neutral-grey-400) border-t border-(--rs-neutral-grey-100) bg-(--rs-neutral-grey-50)/40">
                Click any row to see status details, notes, and clock-in/out times.
              </p>
            </div>
          )}
        </>
      )}

      {/* ── MONTHLY TAB ────────────────────────────────────────────────────────── */}
      {activeTab === 'monthly' && (
        <>
          {/* Month navigator */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" size="icon" onClick={() => changeMonth(m => offsetMonth(m, -1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium text-(--rs-neutral-grey-900) min-w-44 text-center">
              {fmtMonth(month)}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => changeMonth(m => offsetMonth(m, 1))}
              disabled={month >= getCurrentYearMonth()}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            {month !== getCurrentYearMonth() && (
              <Button variant="ghost" size="sm" onClick={() => changeMonth(getCurrentYearMonth())} className="text-(--rs-primary-500) text-sm">
                This Month
              </Button>
            )}
            <div className="ml-auto">
              <AttendanceExportSheet
                mode="monthly"
                baseName={`attendance_month_${month}`}
                rows={monthlyExportRows}
                jsonMeta={{ month, workdays: monthWorkdays }}
                rangeLabel={fmtMonth(month)}
                wisePaymentReference={`Payroll Period ${fmtMonth(month)}`}
                wiseAmounts={monthlyWiseAmounts}
              />
            </div>
          </div>

          {monthError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">{monthError}</div>
          )}

          {monthLoading ? (
            <div className="flex items-center gap-2 text-(--rs-neutral-grey-500) py-8">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading monthly data…</span>
            </div>
          ) : (
            <div className="rounded-lg border border-(--rs-neutral-grey-100) bg-white">
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-(--rs-neutral-grey-100)">
                <div className="relative max-w-xs flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-(--rs-neutral-grey-400)" />
                  <input
                    type="text"
                    value={monthlySearch}
                    onChange={e => { setMonthlySearch(e.target.value); setMonthlyPage(1); }}
                    placeholder="Search member or team…"
                    className="w-full rounded-md border border-(--rs-neutral-grey-200) bg-white pl-8 pr-7 py-1.5 text-sm placeholder:text-(--rs-neutral-grey-400) focus:outline-none focus:border-(--rs-primary-500) focus:ring-2 focus:ring-(--rs-primary-100)"
                  />
                  {monthlySearch && (
                    <button
                      type="button"
                      onClick={() => { setMonthlySearch(''); setMonthlyPage(1); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-(--rs-neutral-grey-400) hover:text-(--rs-neutral-grey-700) hover:bg-(--rs-neutral-grey-100)"
                      aria-label="Clear search"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <span className="shrink-0 text-xs text-(--rs-neutral-grey-400)">{monthWorkdays} workdays this month</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="border-b border-(--rs-neutral-grey-100) bg-(--rs-neutral-grey-50)/40">
                      <th className="text-left py-3 pl-4 pr-4 font-medium text-(--rs-neutral-grey-500) text-xs uppercase tracking-wide">Member</th>
                      <th className="text-center py-3 px-3 font-medium text-green-700 text-xs uppercase tracking-wide">Present</th>
                      <th className="text-center py-3 px-3 font-medium text-blue-700 text-xs uppercase tracking-wide">WFH</th>
                      <th className="text-center py-3 px-3 font-medium text-yellow-700 text-xs uppercase tracking-wide">Leave</th>
                      <th className="text-center py-3 px-3 font-medium text-red-700 text-xs uppercase tracking-wide">Absent</th>
                      <th className="text-center py-3 px-3 font-medium text-purple-700 text-xs uppercase tracking-wide">Weekend</th>
                      <th className="text-center py-3 px-3 font-medium text-(--rs-neutral-grey-500) text-xs uppercase tracking-wide">Tracked</th>
                      <th className="text-center py-3 px-4 font-medium text-(--rs-neutral-grey-500) text-xs uppercase tracking-wide">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedMonthly.map(row => {
                      const tracked = row.present + row.wfh + row.leave + row.absent;
                      const pct = monthWorkdays > 0 ? Math.round((row.present + row.wfh) / monthWorkdays * 100) : 0;
                      return (
                        <tr key={row.userId} className="border-b border-(--rs-neutral-grey-100) hover:bg-(--rs-neutral-grey-50)/60">
                          <td className="py-4 pl-4 pr-4 align-middle">
                            <div className="flex items-center gap-3">
                              <MemberAvatar name={row.name} />
                              <div className="min-w-0">
                                <div className="font-medium text-(--rs-neutral-grey-900) truncate">{row.name}</div>
                                {row.team && <div className="text-xs text-(--rs-neutral-grey-400) truncate">{row.team}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="text-center py-4 px-3 align-middle">
                            <span className="font-semibold text-green-700">{row.present}</span>
                          </td>
                          <td className="text-center py-4 px-3 align-middle">
                            <span className="font-semibold text-blue-700">{row.wfh}</span>
                          </td>
                          <td className="text-center py-4 px-3 align-middle">
                            <span className="font-semibold text-yellow-700">{row.leave}</span>
                          </td>
                          <td className="text-center py-4 px-3 align-middle">
                            <span className="font-semibold text-red-700">{row.absent}</span>
                          </td>
                          <td className="text-center py-4 px-3 align-middle">
                            {row.weekendWork > 0
                              ? <span className="font-semibold text-purple-700">{row.weekendWork}</span>
                              : <span className="text-(--rs-neutral-grey-300) text-sm">—</span>}
                          </td>
                          <td className="text-center py-4 px-3 align-middle">
                            <div className="text-xs text-(--rs-neutral-grey-600)">{tracked}/{monthWorkdays}</div>
                            <div className="text-[10px] text-(--rs-neutral-grey-400) mt-0.5">{pct}% present/WFH</div>
                          </td>
                          <td className="text-center py-4 px-4 align-middle">
                            {row.totalSeconds > 0
                              ? <span className="text-sm font-semibold text-(--rs-neutral-grey-900)">{fmtSeconds(row.totalSeconds)}</span>
                              : <span className="text-(--rs-neutral-grey-300) text-sm">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredMonthly.length === 0 && (
                      <tr>
                        <td colSpan={8} className="text-center py-10 text-(--rs-neutral-grey-400) italic text-sm">
                          {monthlySearch ? 'No members match your search.' : 'No attendance data for this month.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {filteredMonthly.length > 0 && (
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-(--rs-neutral-grey-100) text-xs text-(--rs-neutral-grey-500)">
                  <span>
                    Showing {(monthlyPageSafe - 1) * PAGE_SIZE + 1}–{Math.min(monthlyPageSafe * PAGE_SIZE, filteredMonthly.length)} of {filteredMonthly.length}
                  </span>
                  <Pagination page={monthlyPageSafe} totalPages={monthlyTotalPages} onChange={setMonthlyPage} />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Pagination control ─────────────────────────────────────────────────────────

function Pagination({
  page, totalPages, onChange,
}: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;

  // Build a compact list: 1 … (page-1) page (page+1) … last
  const pages: (number | 'ellipsis')[] = [];
  const add = (p: number | 'ellipsis') => pages.push(p);
  const window = new Set([1, totalPages, page - 1, page, page + 1].filter(n => typeof n === 'number' && n >= 1 && n <= totalPages));
  const sorted = Array.from(window).sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) add('ellipsis');
    add(sorted[i]);
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="rounded p-1 text-(--rs-neutral-grey-500) hover:text-(--rs-neutral-grey-900) hover:bg-(--rs-neutral-grey-100) disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Previous page"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      {pages.map((p, idx) =>
        p === 'ellipsis' ? (
          <span key={`e-${idx}`} className="px-1.5 text-(--rs-neutral-grey-400)">…</span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`min-w-6 h-6 px-1.5 rounded text-xs font-medium ${
              p === page
                ? 'bg-(--rs-primary-500) text-white'
                : 'text-(--rs-neutral-grey-600) hover:bg-(--rs-neutral-grey-100)'
            }`}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="rounded p-1 text-(--rs-neutral-grey-500) hover:text-(--rs-neutral-grey-900) hover:bg-(--rs-neutral-grey-100) disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Next page"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
