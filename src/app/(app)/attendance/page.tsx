'use client';

import { Fragment, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataExportButtons } from '@/components/data-export-buttons';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Loader2, Clock } from 'lucide-react';

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

interface TeamUser { id: number; name: string; team: string | null; role: string; }

interface MonthlySummary {
  userId: number; name: string; team: string | null; role: string;
  present: number; wfh: number; leave: number; absent: number; workdays: number;
  weekendWork: number; totalSeconds: number;
}

interface TimesheetEntry {
  id: number;
  date: string;
  clockedInAt: string;
  clockedOutAt: string | null;
  durationSeconds: number | null;
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
  userId, weekStart, detailDays, notes,
}: { userId: number; weekStart: string; detailDays: DetailDay[]; notes: string | null }) {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);

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
  }, [userId, weekStart]);

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
                <p className="text-xs font-semibold text-(--rs-neutral-grey-600) uppercase tracking-wider">Attendance status</p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
                  {detailDays.map(day => (
                    <div key={day.key} className="rounded border border-(--rs-neutral-grey-200) bg-white px-2.5 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-(--rs-neutral-grey-400)">
                        {day.label} {new Date(day.date + 'T00:00:00').getDate()}
                      </div>
                      <div className={`mt-1 inline-block rounded border px-2 py-0.5 text-xs font-medium ${statusColor(day.status)}`}>
                        {detailDayStatusLabel(day)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-(--rs-neutral-grey-600) uppercase tracking-wider">Notes</p>
                <div className="mt-2 rounded border border-(--rs-neutral-grey-200) bg-white px-3 py-2 text-xs text-(--rs-neutral-grey-600)">
                  {notes?.trim() ? (
                    <p className="whitespace-pre-line">{notes}</p>
                  ) : (
                    <p className="italic text-(--rs-neutral-grey-400)">No attendance notes recorded for this week.</p>
                  )}
                </div>
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
                          daySessions.map(s => (
                            <div key={s.id} className="bg-white border border-(--rs-neutral-grey-200) rounded px-2 py-1.5 space-y-0.5">
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
                            </div>
                          ))
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

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const [activeTab, setActiveTab] = useState<'weekly' | 'monthly'>('weekly');

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

  // Which user row is expanded to show clock-in detail
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);

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
  }, [weekStart]);

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
    setWeekOffset(updater);
  }

  function changeMonth(updater: string | ((value: string) => string)) {
    setMonthLoading(true);
    setMonthError('');
    setMonth(updater);
  }

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
              <DataExportButtons
                baseName={`attendance_week_${weekStart}`}
                rows={weeklyExportRows}
                jsonData={{ weekStart, weekEnd: toLocalISO(sunday), users: weeklyExportRows }}
                title="Export Week"
              />
            </div>
          </div>

          {weekError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">{weekError}</div>
          )}

          {weekLoading ? (
            <div className="flex items-center gap-2 text-(--rs-neutral-grey-500)">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading attendance data…</span>
            </div>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base font-serif">Team Attendance</CardTitle>
                  <p className="text-xs text-(--rs-neutral-grey-400) mt-0.5">Click a row to see status details, notes, and clock-in/out times</p>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[760px]">
                    <thead>
                      <tr className="border-b border-(--rs-neutral-grey-200)">
                        <th className="w-6 py-2" />
                        <th className="text-left py-2 pr-4 font-medium text-(--rs-neutral-grey-600) w-40">Member</th>
                        {DAY_KEYS.map((day, i) => (
                          <th key={day} className="text-center py-2 px-2 font-medium text-(--rs-neutral-grey-600) w-24">
                            <div>{DAY_LABELS[day]}</div>
                            <div className="text-xs font-normal text-(--rs-neutral-grey-400)">{weekdayDates[i]}</div>
                          </th>
                        ))}
                        <th className="text-center py-2 px-3 font-medium text-(--rs-neutral-grey-600) w-20">Hrs/Wk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamUsers.map(user => {
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
                              className={`border-b border-(--rs-neutral-grey-100) hover:bg-(--rs-neutral-grey-50) cursor-pointer transition-colors ${isExpanded ? 'bg-(--rs-neutral-grey-50)' : ''}`}
                              onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
                            >
                              <td className="py-3 pl-2">
                                {isExpanded
                                  ? <ChevronUp className="w-3.5 h-3.5 text-(--rs-neutral-grey-400)" />
                                  : <ChevronDown className="w-3.5 h-3.5 text-(--rs-neutral-grey-400)" />}
                              </td>
                              <td className="py-3 pr-4">
                                <div className="font-medium text-(--rs-neutral-grey-900)">{user.name}</div>
                                {user.team && <div className="text-xs text-(--rs-neutral-grey-400)">{user.team}</div>}
                              </td>
                              {DAY_KEYS.map((day, i) => {
                                const val  = rec ? (rec[`${day}Status` as keyof AttendanceRecord] as string | null) : null;
                                const secs = timesheetsByDay[`${user.id}:${weekdayDateStrs[i]}`] ?? 0;
                                return (
                                  <td key={day} className="text-center py-3 px-2">
                                    <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${statusColor(val)}`}>
                                      {statusLabel(val)}
                                    </span>
                                    {secs > 0 && (
                                      <div className="text-[10px] text-(--rs-neutral-grey-400) mt-0.5">{fmtSeconds(secs)}</div>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="text-center py-3 px-3">
                                {weekSeconds > 0
                                  ? <span className="text-sm font-semibold text-(--rs-primary-700)">{fmtSeconds(weekSeconds)}</span>
                                  : <span className="text-xs text-(--rs-neutral-grey-400)">—</span>}
                              </td>
                            </tr>
                            {isExpanded && (
                              <TimesheetDetailPanel
                                userId={user.id}
                                weekStart={weekStart}
                                detailDays={detailDays}
                                notes={rec?.notes ?? null}
                              />
                            )}
                          </Fragment>
                        );
                      })}
                      {teamUsers.length === 0 && (
                        <tr>
                          <td colSpan={10} className="text-center py-8 text-(--rs-neutral-grey-400) italic text-sm">
                            No team members found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
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
              <DataExportButtons
                baseName={`attendance_month_${month}`}
                rows={monthlyExportRows}
                jsonData={{ month, workdays: monthWorkdays, summary: monthlyExportRows }}
                title="Export Month"
              />
            </div>
          </div>

          {monthError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">{monthError}</div>
          )}

          {monthLoading ? (
            <div className="flex items-center gap-2 text-(--rs-neutral-grey-500)">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading monthly data…</span>
            </div>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-serif">Monthly Summary</CardTitle>
                  <span className="text-xs text-(--rs-neutral-grey-400)">{monthWorkdays} workdays this month</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="border-b border-(--rs-neutral-grey-200)">
                        <th className="text-left py-2 pr-4 font-medium text-(--rs-neutral-grey-600) w-40">Member</th>
                        <th className="text-center py-2 px-3 font-medium text-green-700">Present</th>
                        <th className="text-center py-2 px-3 font-medium text-blue-700">WFH</th>
                        <th className="text-center py-2 px-3 font-medium text-yellow-700">Leave</th>
                        <th className="text-center py-2 px-3 font-medium text-red-700">Absent</th>
                        <th className="text-center py-2 px-3 font-medium text-purple-700">Weekend</th>
                        <th className="text-center py-2 px-3 font-medium text-(--rs-neutral-grey-500)">Tracked</th>
                        <th className="text-center py-2 px-3 font-medium text-(--rs-primary-600)">Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlySummary.map(row => {
                        const tracked = row.present + row.wfh + row.leave + row.absent;
                        const pct = monthWorkdays > 0 ? Math.round((row.present + row.wfh) / monthWorkdays * 100) : 0;
                        return (
                          <tr key={row.userId} className="border-b border-(--rs-neutral-grey-100) hover:bg-(--rs-neutral-grey-50)">
                            <td className="py-3 pr-4">
                              <div className="font-medium text-(--rs-neutral-grey-900)">{row.name}</div>
                              {row.team && <div className="text-xs text-(--rs-neutral-grey-400)">{row.team}</div>}
                            </td>
                            <td className="text-center py-3 px-3">
                              <span className="font-semibold text-green-700">{row.present}</span>
                            </td>
                            <td className="text-center py-3 px-3">
                              <span className="font-semibold text-blue-700">{row.wfh}</span>
                            </td>
                            <td className="text-center py-3 px-3">
                              <span className="font-semibold text-yellow-700">{row.leave}</span>
                            </td>
                            <td className="text-center py-3 px-3">
                              <span className="font-semibold text-red-700">{row.absent}</span>
                            </td>
                            <td className="text-center py-3 px-3">
                              {row.weekendWork > 0
                                ? <span className="font-semibold text-purple-700">{row.weekendWork}</span>
                                : <span className="text-xs text-(--rs-neutral-grey-300)">—</span>}
                            </td>
                            <td className="text-center py-3 px-3">
                              <div className="text-xs text-(--rs-neutral-grey-500)">{tracked}/{monthWorkdays}</div>
                              <div className="text-[10px] text-(--rs-neutral-grey-400)">{pct}% present/WFH</div>
                            </td>
                            <td className="text-center py-3 px-3">
                              {row.totalSeconds > 0
                                ? <span className="text-sm font-semibold text-(--rs-primary-700)">{fmtSeconds(row.totalSeconds)}</span>
                                : <span className="text-xs text-(--rs-neutral-grey-400)">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                      {monthlySummary.length === 0 && (
                        <tr>
                          <td colSpan={8} className="text-center py-8 text-(--rs-neutral-grey-400) italic text-sm">
                            No attendance data for this month.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
