'use client';

/* eslint-disable react-hooks/preserve-manual-memoization, react-hooks/set-state-in-effect */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ClientEngagement { activity: string; date: string; details: string; }
interface Risk { description: string; resolution: string; escalation: string; }
interface Meeting { title: string; date: string; participants: string; notes: string; }

interface MemberReport {
  user: { id: number; name: string; role: string; team: string | null; jobTitle: string | null };
  report: {
    id: number; weekStart: string; submittedAt: string | null;
    clientEngagements: ClientEngagement[]; risks: Risk[]; meetings: Meeting[]; ideas: string;
  } | null;
}

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

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function initials(name: string): string {
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

// ── Expandable member row ──────────────────────────────────────────────────────

function MemberRow({ member }: { member: MemberReport }) {
  const [open, setOpen] = useState(false);
  const r = member.report;
  const submitted = !!r?.submittedAt;

  return (
    <div className="border border-(--rs-neutral-grey-200) rounded-lg overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-(--rs-neutral-grey-50) transition-colors text-left"
      >
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-(--rs-primary-100) text-(--rs-primary-700) flex items-center justify-center text-xs font-bold shrink-0">
          {initials(member.user.name)}
        </div>

        {/* Name + role */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-(--rs-neutral-grey-900) truncate">{member.user.name}</div>
          {member.user.jobTitle && (
            <div className="text-xs text-(--rs-neutral-grey-400) truncate">{member.user.jobTitle}</div>
          )}
        </div>

        {/* Stats */}
        {r && (
          <div className="hidden sm:flex items-center gap-4 text-xs text-(--rs-neutral-grey-500) shrink-0">
            <span>{r.clientEngagements.length} engagement{r.clientEngagements.length !== 1 ? 's' : ''}</span>
            {r.meetings.length > 0 && <span>{r.meetings.length} meeting{r.meetings.length !== 1 ? 's' : ''}</span>}
            <span>{r.risks.length} risk{r.risks.length !== 1 ? 's' : ''}</span>
            {r.ideas && <span>Has ideas</span>}
          </div>
        )}

        {/* Status badge */}
        <span className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
          submitted
            ? 'bg-green-100 text-green-700'
            : 'bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-500)'
        }`}>
          {submitted ? <><CheckCircle2 className="w-3 h-3" /> Submitted</> : <><AlertCircle className="w-3 h-3" /> Not submitted</>}
        </span>

        {/* Expand icon */}
        {submitted && (
          <span className="shrink-0 text-(--rs-neutral-grey-400) ml-1">
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        )}
      </button>

      {/* Expanded detail */}
      {open && r && submitted && (
        <div className="border-t border-(--rs-neutral-grey-100) px-4 py-4 space-y-4 bg-(--rs-neutral-grey-50)">
          <div className="text-xs text-(--rs-neutral-grey-400)">Submitted {fmtDateTime(r.submittedAt!)}</div>

          {/* Client Engagements */}
          {r.clientEngagements.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-(--rs-neutral-grey-500) mb-2">Client Engagements</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[400px]">
                  <thead>
                    <tr className="border-b border-(--rs-neutral-grey-200) text-left">
                      <th className="pb-1.5 pr-3 font-medium text-(--rs-neutral-grey-500) w-[40%]">Activity</th>
                      <th className="pb-1.5 pr-3 font-medium text-(--rs-neutral-grey-500) w-24">Date</th>
                      <th className="pb-1.5 font-medium text-(--rs-neutral-grey-500)">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-(--rs-neutral-grey-100)">
                    {r.clientEngagements.map((e, i) => (
                      <tr key={i}>
                        <td className="py-1.5 pr-3 text-(--rs-neutral-grey-800)">{e.activity || '—'}</td>
                        <td className="py-1.5 pr-3 text-(--rs-neutral-grey-500)">{e.date || '—'}</td>
                        <td className="py-1.5 text-(--rs-neutral-grey-700)">{e.details || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Meetings */}
          {r.meetings.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-(--rs-neutral-grey-500) mb-2">Meetings</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[460px]">
                  <thead>
                    <tr className="border-b border-(--rs-neutral-grey-200) text-left">
                      <th className="pb-1.5 pr-3 font-medium text-(--rs-neutral-grey-500) w-[28%]">Title</th>
                      <th className="pb-1.5 pr-3 font-medium text-(--rs-neutral-grey-500) w-24">Date</th>
                      <th className="pb-1.5 pr-3 font-medium text-(--rs-neutral-grey-500) w-[25%]">Participants</th>
                      <th className="pb-1.5 font-medium text-(--rs-neutral-grey-500)">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-(--rs-neutral-grey-100)">
                    {r.meetings.map((m, i) => (
                      <tr key={i}>
                        <td className="py-1.5 pr-3 text-(--rs-neutral-grey-800)">{m.title || '—'}</td>
                        <td className="py-1.5 pr-3 text-(--rs-neutral-grey-500)">{m.date || '—'}</td>
                        <td className="py-1.5 pr-3 text-(--rs-neutral-grey-700)">{m.participants || '—'}</td>
                        <td className="py-1.5 text-(--rs-neutral-grey-700)">{m.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Risks */}
          {r.risks.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-(--rs-neutral-grey-500) mb-2">Risks / Issues</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[400px]">
                  <thead>
                    <tr className="border-b border-(--rs-neutral-grey-200) text-left">
                      <th className="pb-1.5 pr-3 font-medium text-(--rs-neutral-grey-500) w-[35%]">Description</th>
                      <th className="pb-1.5 pr-3 font-medium text-(--rs-neutral-grey-500) w-[35%]">Resolution</th>
                      <th className="pb-1.5 font-medium text-(--rs-neutral-grey-500) w-24">Escalation?</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-(--rs-neutral-grey-100)">
                    {r.risks.map((risk, i) => (
                      <tr key={i}>
                        <td className="py-1.5 pr-3 text-(--rs-neutral-grey-800)">{risk.description || '—'}</td>
                        <td className="py-1.5 pr-3 text-(--rs-neutral-grey-700)">{risk.resolution || '—'}</td>
                        <td className={`py-1.5 font-medium ${risk.escalation === 'Yes' ? 'text-red-600' : 'text-(--rs-neutral-grey-500)'}`}>
                          {risk.escalation || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Ideas */}
          {r.ideas && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-(--rs-neutral-grey-500) mb-2">Ideas / Recommendations</h4>
              <p className="text-xs text-(--rs-neutral-grey-700) whitespace-pre-line">{r.ideas}</p>
            </div>
          )}

          {r.clientEngagements.length === 0 && r.meetings.length === 0 && r.risks.length === 0 && !r.ideas && (
            <p className="text-xs text-(--rs-neutral-grey-400) italic">Report submitted with no entries.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function TeamReportsView() {
  const [weekOffset, setWeekOffset] = useState(0);
  const monday = getMondayDate(weekOffset);
  const friday = new Date(monday.getTime() + 4 * 86400000);
  const weekStart = toLocalISO(monday);

  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [members, setMembers] = useState<MemberReport[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    fetch(`/api/weekly-report/team?week=${weekStart}`)
      .then(r => r.json())
      .then((d: { members?: MemberReport[]; error?: string }) => {
        if (d.error) { setError(d.error); return; }
        setMembers(d.members ?? []);
      })
      .catch(() => setError('Failed to load team reports.'))
      .finally(() => setLoading(false));
  }, [weekStart]);

  useEffect(() => { load(); }, [load]);

  const submitted = members.filter(m => m.report?.submittedAt);

  return (
    <div className="space-y-5">
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
        {!loading && (
          <span className="text-xs text-(--rs-neutral-grey-400)">
            {submitted.length}/{members.length} submitted
          </span>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-(--rs-neutral-grey-500)">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading team reports…</span>
        </div>
      ) : members.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-(--rs-neutral-grey-400) text-sm italic">
            No team members found.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-serif">Team Submissions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {members.map(m => <MemberRow key={m.user.id} member={m} />)}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
