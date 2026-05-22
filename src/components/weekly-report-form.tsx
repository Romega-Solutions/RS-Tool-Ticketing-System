'use client';

/* eslint-disable react-hooks/preserve-manual-memoization, react-hooks/set-state-in-effect */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Plus, Trash2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ClientEngagement { activity: string; date: string; details: string; }
interface Risk { description: string; resolution: string; escalation: string; }
interface Meeting { title: string; date: string; participants: string; notes: string; }
interface PendingTask { project: string; title: string; status: string; statusGroup: string; targetDate: string | null; }
interface AccomplishmentTask { project: string; title: string; completedAt: string; }

// ── Helpers ────────────────────────────────────────────────────────────────────

function getMondayDate(offset = 0): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow) + offset * 7);
  return d;
}

function toLocalISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDateShort(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function statusGroupColor(group: string): string {
  if (group === 'completed') return 'bg-green-100 text-green-700 border-green-300';
  if (group === 'started' || group === 'in_progress' || group === 'inprogress') return 'bg-blue-100 text-blue-700 border-blue-300';
  return 'bg-yellow-100 text-yellow-700 border-yellow-300';
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function WeeklyReportForm() {
  const [weekOffset, setWeekOffset] = useState(0);
  const monday = getMondayDate(weekOffset);
  const friday = new Date(monday.getTime() + 4 * 86400000);
  const weekStart = toLocalISO(monday);

  // Form state
  const [engagements, setEngagements] = useState<ClientEngagement[]>([]);
  const [meetings,    setMeetings]    = useState<Meeting[]>([]);
  const [risks,       setRisks]       = useState<Risk[]>([]);
  const [ideas,       setIdeas]       = useState('');

  // Load state
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // Task data (sourced from internal tickets DB).
  const [tasksLoading,    setTasksLoading]    = useState(false);
  const [pending,         setPending]         = useState<PendingTask[]>([]);
  const [accomplishments, setAccomplishments] = useState<AccomplishmentTask[]>([]);
  const [tasksError,      setTasksError]      = useState('');

  // Load saved report for this week
  const loadReport = useCallback(() => {
    setLoading(true);
    setSaveState('idle');
    fetch(`/api/weekly-report?week=${weekStart}`)
      .then(r => r.json())
      .then((d: { report?: { clientEngagements: ClientEngagement[]; risks: Risk[]; meetings: Meeting[]; ideas: string; submittedAt: string | null } | null }) => {
        if (d.report) {
          setEngagements(d.report.clientEngagements ?? []);
          setMeetings(d.report.meetings ?? []);
          setRisks(d.report.risks ?? []);
          setIdeas(d.report.ideas ?? '');
          setLastSaved(d.report.submittedAt);
        } else {
          setEngagements([]);
          setMeetings([]);
          setRisks([]);
          setIdeas('');
          setLastSaved(null);
        }
      })
      .finally(() => setLoading(false));
  }, [weekStart]);

  useEffect(() => { loadReport(); }, [loadReport]);

  // Load task data for this week from the internal tickets DB.
  useEffect(() => {
    setTasksLoading(true);
    setTasksError('');
    fetch(`/api/weekly-report/plane-data?week=${weekStart}`)
      .then(r => r.json())
      .then((d: { configured?: boolean; pending: PendingTask[]; accomplishments: AccomplishmentTask[]; error?: string }) => {
        setPending(d.pending ?? []);
        setAccomplishments(d.accomplishments ?? []);
        if (d.error) setTasksError(d.error);
      })
      .catch(() => setTasksError('Could not load tasks.'))
      .finally(() => setTasksLoading(false));
  }, [weekStart]);

  const save = async () => {
    setSaving(true);
    setSaveState('idle');
    try {
      const res = await fetch('/api/weekly-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart, clientEngagements: engagements, meetings, risks, ideas }),
      });
      if (!res.ok) throw new Error();
      setSaveState('saved');
      setLastSaved(new Date().toISOString());
      setTimeout(() => setSaveState('idle'), 3000);
    } catch {
      setSaveState('error');
    } finally {
      setSaving(false);
    }
  };

  // ── Meeting helpers
  const addMeeting    = () => setMeetings(m => [...m, { title: '', date: '', participants: '', notes: '' }]);
  const updateMeeting = (i: number, field: keyof Meeting, val: string) =>
    setMeetings(m => m.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const removeMeeting = (i: number) => setMeetings(m => m.filter((_, idx) => idx !== i));

  // ── Engagement helpers
  const addEngagement  = () => setEngagements(e => [...e, { activity: '', date: '', details: '' }]);
  const updateEngagement = (i: number, field: keyof ClientEngagement, val: string) =>
    setEngagements(e => e.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  const removeEngagement = (i: number) => setEngagements(e => e.filter((_, idx) => idx !== i));

  // ── Risk helpers
  const addRisk    = () => setRisks(r => [...r, { description: '', resolution: '', escalation: '' }]);
  const updateRisk = (i: number, field: keyof Risk, val: string) =>
    setRisks(r => r.map((row, idx) => idx === i ? { ...row, [field]: val } : row));
  const removeRisk = (i: number) => setRisks(r => r.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-6">
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
        {lastSaved && (
          <span className="text-xs text-(--rs-neutral-grey-400) ml-2">
            Last saved {fmtDateTime(lastSaved)}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-(--rs-neutral-grey-500)">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading report…</span>
        </div>
      ) : (
        <div className="space-y-5">

          {/* ── Section 1: Client Engagement Activities */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-serif">Client Engagement Activities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {engagements.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[500px]">
                    <thead>
                      <tr className="border-b border-(--rs-neutral-grey-200) text-left">
                        <th className="pb-2 pr-3 font-medium text-(--rs-neutral-grey-600) w-[40%]">Activity</th>
                        <th className="pb-2 pr-3 font-medium text-(--rs-neutral-grey-600) w-28">Date</th>
                        <th className="pb-2 pr-3 font-medium text-(--rs-neutral-grey-600)">Details</th>
                        <th className="pb-2 w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-(--rs-neutral-grey-100)">
                      {engagements.map((row, i) => (
                        <tr key={i}>
                          <td className="py-2 pr-3">
                            <input
                              className="w-full text-sm border border-(--rs-neutral-grey-200) rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-(--rs-primary-400)"
                              value={row.activity}
                              onChange={e => updateEngagement(i, 'activity', e.target.value)}
                              placeholder="Activity"
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              type="date"
                              className="w-full text-sm border border-(--rs-neutral-grey-200) rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-(--rs-primary-400)"
                              value={row.date}
                              onChange={e => updateEngagement(i, 'date', e.target.value)}
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              className="w-full text-sm border border-(--rs-neutral-grey-200) rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-(--rs-primary-400)"
                              value={row.details}
                              onChange={e => updateEngagement(i, 'details', e.target.value)}
                              placeholder="Details"
                            />
                          </td>
                          <td className="py-2">
                            <button onClick={() => removeEngagement(i)} className="text-(--rs-neutral-grey-400) hover:text-red-500 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-(--rs-neutral-grey-400) italic">No entries yet.</p>
              )}
              <Button variant="outline" size="sm" onClick={addEngagement} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add Row
              </Button>
            </CardContent>
          </Card>

          {/* ── Section 2: Meetings */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-serif">Meetings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {meetings.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="border-b border-(--rs-neutral-grey-200) text-left">
                        <th className="pb-2 pr-3 font-medium text-(--rs-neutral-grey-600) w-[28%]">Title</th>
                        <th className="pb-2 pr-3 font-medium text-(--rs-neutral-grey-600) w-28">Date</th>
                        <th className="pb-2 pr-3 font-medium text-(--rs-neutral-grey-600) w-[25%]">Participants</th>
                        <th className="pb-2 pr-3 font-medium text-(--rs-neutral-grey-600)">Notes / Outcome</th>
                        <th className="pb-2 w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-(--rs-neutral-grey-100)">
                      {meetings.map((row, i) => (
                        <tr key={i}>
                          <td className="py-2 pr-3">
                            <input
                              className="w-full text-sm border border-(--rs-neutral-grey-200) rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-(--rs-primary-400)"
                              value={row.title}
                              onChange={e => updateMeeting(i, 'title', e.target.value)}
                              placeholder="Meeting title"
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              type="date"
                              className="w-full text-sm border border-(--rs-neutral-grey-200) rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-(--rs-primary-400)"
                              value={row.date}
                              onChange={e => updateMeeting(i, 'date', e.target.value)}
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              className="w-full text-sm border border-(--rs-neutral-grey-200) rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-(--rs-primary-400)"
                              value={row.participants}
                              onChange={e => updateMeeting(i, 'participants', e.target.value)}
                              placeholder="Who attended"
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              className="w-full text-sm border border-(--rs-neutral-grey-200) rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-(--rs-primary-400)"
                              value={row.notes}
                              onChange={e => updateMeeting(i, 'notes', e.target.value)}
                              placeholder="Outcome / key decisions"
                            />
                          </td>
                          <td className="py-2">
                            <button onClick={() => removeMeeting(i)} className="text-(--rs-neutral-grey-400) hover:text-red-500 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-(--rs-neutral-grey-400) italic">No meetings logged yet.</p>
              )}
              <Button variant="outline" size="sm" onClick={addMeeting} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add Meeting
              </Button>
            </CardContent>
          </Card>

          {/* ── Section 3: Risks / Issues / Roadblocks */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-serif">Risks / Issues / Roadblocks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {risks.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead>
                      <tr className="border-b border-(--rs-neutral-grey-200) text-left">
                        <th className="pb-2 pr-3 font-medium text-(--rs-neutral-grey-600) w-[35%]">Description</th>
                        <th className="pb-2 pr-3 font-medium text-(--rs-neutral-grey-600) w-[35%]">Resolution</th>
                        <th className="pb-2 pr-3 font-medium text-(--rs-neutral-grey-600) w-28">Escalation?</th>
                        <th className="pb-2 w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-(--rs-neutral-grey-100)">
                      {risks.map((row, i) => (
                        <tr key={i}>
                          <td className="py-2 pr-3">
                            <input
                              className="w-full text-sm border border-(--rs-neutral-grey-200) rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-(--rs-primary-400)"
                              value={row.description}
                              onChange={e => updateRisk(i, 'description', e.target.value)}
                              placeholder="Describe the issue"
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              className="w-full text-sm border border-(--rs-neutral-grey-200) rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-(--rs-primary-400)"
                              value={row.resolution}
                              onChange={e => updateRisk(i, 'resolution', e.target.value)}
                              placeholder="Proposed resolution"
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <select
                              className="w-full text-sm border border-(--rs-neutral-grey-200) rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-(--rs-primary-400) bg-white"
                              value={row.escalation}
                              onChange={e => updateRisk(i, 'escalation', e.target.value)}
                            >
                              <option value="">—</option>
                              <option value="Yes">Yes</option>
                              <option value="No">No</option>
                            </select>
                          </td>
                          <td className="py-2">
                            <button onClick={() => removeRisk(i)} className="text-(--rs-neutral-grey-400) hover:text-red-500 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-(--rs-neutral-grey-400) italic">No entries yet.</p>
              )}
              <Button variant="outline" size="sm" onClick={addRisk} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add Row
              </Button>
            </CardContent>
          </Card>

          {/* ── Section 4: Ideas / Recommendations */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-serif">Ideas / Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                className="w-full text-sm border border-(--rs-neutral-grey-200) rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-(--rs-primary-400) resize-y min-h-[80px]"
                placeholder="Share any ideas or recommendations for this week…"
                value={ideas}
                onChange={e => setIdeas(e.target.value)}
                rows={3}
              />
            </CardContent>
          </Card>

          {/* ── Section 5: tasks auto-populated from internal tickets */}
          {(
            <>
              {/* Pending Projects */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-serif">Pending Projects</CardTitle>
                    <span className="text-xs text-(--rs-neutral-grey-400)">Auto-populated from your tickets</span>
                  </div>
                </CardHeader>
                <CardContent>
                  {tasksLoading ? (
                    <div className="flex items-center gap-2 text-(--rs-neutral-grey-400) text-sm">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                    </div>
                  ) : tasksError ? (
                    <p className="text-sm text-red-500">{tasksError}</p>
                  ) : pending.length === 0 ? (
                    <p className="text-sm text-(--rs-neutral-grey-400) italic">No pending tasks found.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[480px]">
                        <thead>
                          <tr className="border-b border-(--rs-neutral-grey-200) text-left">
                            <th className="pb-2 pr-3 font-medium text-(--rs-neutral-grey-600) w-[30%]">Project</th>
                            <th className="pb-2 pr-3 font-medium text-(--rs-neutral-grey-600)">Task</th>
                            <th className="pb-2 pr-3 font-medium text-(--rs-neutral-grey-600) w-28">Status</th>
                            <th className="pb-2 font-medium text-(--rs-neutral-grey-600) w-24">Due</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-(--rs-neutral-grey-100)">
                          {pending.map((item, i) => (
                            <tr key={i} className="hover:bg-(--rs-neutral-grey-50)">
                              <td className="py-2 pr-3 text-(--rs-neutral-grey-500) text-xs">{item.project}</td>
                              <td className="py-2 pr-3 text-(--rs-neutral-grey-800)">{item.title}</td>
                              <td className="py-2 pr-3">
                                <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${statusGroupColor(item.statusGroup)}`}>
                                  {item.status}
                                </span>
                              </td>
                              <td className="py-2 text-xs text-(--rs-neutral-grey-500)">
                                {item.targetDate ? fmtDateShort(item.targetDate) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Key Accomplishments */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-serif">Key Accomplishments</CardTitle>
                    <span className="text-xs text-(--rs-neutral-grey-400)">Completed this week</span>
                  </div>
                </CardHeader>
                <CardContent>
                  {tasksLoading ? (
                    <div className="flex items-center gap-2 text-(--rs-neutral-grey-400) text-sm">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                    </div>
                  ) : accomplishments.length === 0 ? (
                    <p className="text-sm text-(--rs-neutral-grey-400) italic">No tasks completed this week yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[400px]">
                        <thead>
                          <tr className="border-b border-(--rs-neutral-grey-200) text-left">
                            <th className="pb-2 pr-3 font-medium text-(--rs-neutral-grey-600) w-[30%]">Project</th>
                            <th className="pb-2 pr-3 font-medium text-(--rs-neutral-grey-600)">Description</th>
                            <th className="pb-2 font-medium text-(--rs-neutral-grey-600) w-28">Completed</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-(--rs-neutral-grey-100)">
                          {accomplishments.map((item, i) => (
                            <tr key={i} className="hover:bg-(--rs-neutral-grey-50)">
                              <td className="py-2 pr-3 text-(--rs-neutral-grey-500) text-xs">{item.project}</td>
                              <td className="py-2 pr-3 text-(--rs-neutral-grey-800)">{item.title}</td>
                              <td className="py-2 text-xs text-green-600">{fmtDateTime(item.completedAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {/* Save bar */}
          <div className="flex items-center gap-3 pt-1">
            <Button onClick={save} disabled={saving} className="gap-2 bg-(--rs-primary-500) hover:bg-(--rs-primary-600) text-white">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving…' : 'Save Report'}
            </Button>
            {saveState === 'saved' && (
              <span className="flex items-center gap-1.5 text-sm text-green-600">
                <CheckCircle2 className="w-4 h-4" /> Saved
              </span>
            )}
            {saveState === 'error' && (
              <span className="flex items-center gap-1.5 text-sm text-red-500">
                <AlertCircle className="w-4 h-4" /> Failed to save
              </span>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
