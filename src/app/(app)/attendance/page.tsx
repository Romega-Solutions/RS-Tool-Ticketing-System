'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

type DayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday';

interface AttendanceRecord {
  id: number; userId: number; weekStart: string;
  mondayStatus: string | null; tuesdayStatus: string | null;
  wednesdayStatus: string | null; thursdayStatus: string | null;
  fridayStatus: string | null; notes: string | null; submittedAt: string | null;
}

interface TeamUser { id: number; name: string; team: string | null; role: string; }

interface MonthlySummary {
  userId: number; name: string; team: string | null; role: string;
  present: number; wfh: number; leave: number; absent: number; workdays: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DAY_KEYS: DayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const DAY_LABELS: Record<DayKey, string> = {
  monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri',
};

const STATUS_OPTS = [
  { value: 'present', label: 'Present', color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'wfh',     label: 'WFH',     color: 'bg-blue-100 text-blue-700 border-blue-300'   },
  { value: 'leave',   label: 'Leave',   color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'absent',  label: 'Absent',  color: 'bg-red-100 text-red-700 border-red-300'      },
];

function statusColor(val: string | null): string {
  return STATUS_OPTS.find(o => o.value === (val ?? ''))?.color
    ?? 'bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-500) border-(--rs-neutral-grey-200)';
}
function statusLabel(val: string | null): string {
  return STATUS_OPTS.find(o => o.value === (val ?? ''))?.label ?? '—';
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

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const [activeTab, setActiveTab] = useState<'weekly' | 'monthly'>('weekly');

  // Weekly state
  const [weekOffset, setWeekOffset] = useState(0);
  const monday = getMondayDate(weekOffset);
  const friday = new Date(monday.getTime() + 4 * 86400000);
  const weekStart = toLocalISO(monday);
  const dayDates = DAY_KEYS.map((_, i) => new Date(monday.getTime() + i * 86400000).getDate());

  const [weekLoading, setWeekLoading] = useState(true);
  const [weekError,   setWeekError]   = useState('');
  const [teamUsers,   setTeamUsers]   = useState<TeamUser[]>([]);
  const [teamRecords, setTeamRecords] = useState<AttendanceRecord[]>([]);

  const loadWeek = useCallback(() => {
    let cancelled = false;
    setWeekLoading(true);
    setWeekError('');
    fetch(`/api/attendance?week=${weekStart}`)
      .then(r => r.json())
      .then((d: { users?: TeamUser[]; records?: AttendanceRecord[]; error?: string }) => {
        if (cancelled) return;
        if (d.error) { setWeekError(d.error); return; }
        setTeamUsers(d.users ?? []);
        setTeamRecords(d.records ?? []);
      })
      .catch(() => { if (!cancelled) setWeekError('Failed to load attendance data.'); })
      .finally(() => { if (!cancelled) setWeekLoading(false); });
    return () => { cancelled = true; };
  }, [weekStart]);

  useEffect(loadWeek, [loadWeek]);

  // Monthly state
  const [month, setMonth] = useState(getCurrentYearMonth());
  const [monthLoading, setMonthLoading] = useState(false);
  const [monthError,   setMonthError]   = useState('');
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary[]>([]);
  const [monthWorkdays,  setMonthWorkdays]  = useState(0);

  const loadMonth = useCallback(() => {
    let cancelled = false;
    setMonthLoading(true);
    setMonthError('');
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
  }, [month]);

  useEffect(() => { if (activeTab === 'monthly') loadMonth(); }, [activeTab, loadMonth]);

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
            onClick={() => setActiveTab(tab)}
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
            <Button variant="outline" size="icon" onClick={() => setWeekOffset(w => w - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium text-(--rs-neutral-grey-900) min-w-44 text-center">
              {fmtDate(monday)} – {fmtDate(friday)}
            </span>
            <Button variant="outline" size="icon" onClick={() => setWeekOffset(w => w + 1)} disabled={weekOffset >= 0}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            {weekOffset !== 0 && (
              <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)} className="text-(--rs-primary-500) text-sm">
                This Week
              </Button>
            )}
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
                <CardTitle className="text-base font-serif">Team Attendance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[540px]">
                    <thead>
                      <tr className="border-b border-(--rs-neutral-grey-200)">
                        <th className="text-left py-2 pr-4 font-medium text-(--rs-neutral-grey-600) w-40">Member</th>
                        {DAY_KEYS.map((day, i) => (
                          <th key={day} className="text-center py-2 px-2 font-medium text-(--rs-neutral-grey-600) w-24">
                            <div>{DAY_LABELS[day]}</div>
                            <div className="text-xs font-normal text-(--rs-neutral-grey-400)">{dayDates[i]}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {teamUsers.map(user => {
                        const rec = teamRecords.find(r => r.userId === user.id);
                        return (
                          <tr key={user.id} className="border-b border-(--rs-neutral-grey-100) hover:bg-(--rs-neutral-grey-50)">
                            <td className="py-3 pr-4">
                              <div className="font-medium text-(--rs-neutral-grey-900)">{user.name}</div>
                              {user.team && <div className="text-xs text-(--rs-neutral-grey-400)">{user.team}</div>}
                            </td>
                            {DAY_KEYS.map(day => {
                              const val = rec ? (rec[`${day}Status` as keyof AttendanceRecord] as string | null) : null;
                              return (
                                <td key={day} className="text-center py-3 px-2">
                                  <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${statusColor(val)}`}>
                                    {statusLabel(val)}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                      {teamUsers.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center py-8 text-(--rs-neutral-grey-400) italic text-sm">
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
            <Button variant="outline" size="icon" onClick={() => setMonth(m => offsetMonth(m, -1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium text-(--rs-neutral-grey-900) min-w-44 text-center">
              {fmtMonth(month)}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setMonth(m => offsetMonth(m, 1))}
              disabled={month >= getCurrentYearMonth()}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            {month !== getCurrentYearMonth() && (
              <Button variant="ghost" size="sm" onClick={() => setMonth(getCurrentYearMonth())} className="text-(--rs-primary-500) text-sm">
                This Month
              </Button>
            )}
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
                  <table className="w-full text-sm min-w-[480px]">
                    <thead>
                      <tr className="border-b border-(--rs-neutral-grey-200)">
                        <th className="text-left py-2 pr-4 font-medium text-(--rs-neutral-grey-600) w-40">Member</th>
                        <th className="text-center py-2 px-3 font-medium text-green-700">Present</th>
                        <th className="text-center py-2 px-3 font-medium text-blue-700">WFH</th>
                        <th className="text-center py-2 px-3 font-medium text-yellow-700">Leave</th>
                        <th className="text-center py-2 px-3 font-medium text-red-700">Absent</th>
                        <th className="text-center py-2 px-3 font-medium text-(--rs-neutral-grey-500)">Tracked</th>
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
                              <div className="text-xs text-(--rs-neutral-grey-500)">{tracked}/{monthWorkdays}</div>
                              <div className="text-[10px] text-(--rs-neutral-grey-400)">{pct}% present/WFH</div>
                            </td>
                          </tr>
                        );
                      })}
                      {monthlySummary.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center py-8 text-(--rs-neutral-grey-400) italic text-sm">
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
