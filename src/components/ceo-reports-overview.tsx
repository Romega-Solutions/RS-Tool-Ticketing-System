'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataExportButtons } from '@/components/data-export-buttons';
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

interface TeamGroup {
  team: string;
  members: MemberReport[];
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

function normalizeRole(role: string): 'admin' | 'lead' | 'ic' {
  const v = role.toLowerCase();
  if (['admin', 'ceo', 'owner', 'superadmin'].includes(v)) return 'admin';
  if (['lead', 'team_lead', 'teamlead', 'manager', 'tl'].includes(v)) return 'lead';
  return 'ic';
}

// ── Team Card ─────────────────────────────────────────────────────────────────

function TeamCard({ group }: { group: TeamGroup }) {
  const [open, setOpen] = useState(false);

  const leads = group.members.filter(m => normalizeRole(m.user.role) === 'lead' || normalizeRole(m.user.role) === 'admin');
  const ics   = group.members.filter(m => normalizeRole(m.user.role) === 'ic');
  const total = group.members.length;
  const submitted = group.members.filter(m => m.report?.submittedAt).length;
  const pct = total > 0 ? Math.round((submitted / total) * 100) : 0;

  const escalations = group.members.flatMap(m => (m.report?.risks ?? []).filter(r => r.escalation === 'Yes'));
  const hasEscalations = escalations.length > 0;

  return (
    <Card className={`border ${hasEscalations ? 'border-red-300' : 'border-(--rs-neutral-grey-200)'}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          {/* Team name + lead names */}
          <div>
            <CardTitle className="text-base font-serif">{group.team || 'Unassigned'}</CardTitle>
            {leads.length > 0 && (
              <p className="text-xs text-(--rs-neutral-grey-400) mt-0.5">
                Lead: {leads.map(l => l.user.name).join(', ')}
              </p>
            )}
          </div>

          {/* Submission rate pill */}
          <div className="flex flex-col items-end gap-1">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
              pct === 100 ? 'bg-green-100 text-green-700'
              : pct >= 50  ? 'bg-yellow-100 text-yellow-700'
              : 'bg-red-100 text-red-700'
            }`}>
              {submitted}/{total} submitted
            </span>
            {hasEscalations && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                <AlertCircle className="w-3 h-3" />
                {escalations.length} escalation{escalations.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 rounded-full bg-(--rs-neutral-grey-100) overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {/* Escalations callout */}
        {hasEscalations && (
          <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 space-y-1">
            <p className="text-xs font-semibold text-red-700">Escalations flagged:</p>
            {escalations.map((esc, i) => {
              const member = group.members.find(m => m.report?.risks.includes(esc));
              return (
                <p key={i} className="text-xs text-red-700">
                  <span className="font-medium">{member?.user.name ?? '?'}:</span> {esc.description}
                </p>
              );
            })}
          </div>
        )}

        {/* Member list — compact */}
        <div className="space-y-1.5">
          {/* Show leads first */}
          {[...leads, ...ics].map(m => (
            <div key={m.user.id} className="flex items-center gap-2.5">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                normalizeRole(m.user.role) === 'lead' || normalizeRole(m.user.role) === 'admin'
                  ? 'bg-(--rs-accent-100) text-(--rs-accent-700)'
                  : 'bg-(--rs-primary-100) text-(--rs-primary-700)'
              }`}>
                {initials(m.user.name)}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm text-(--rs-neutral-grey-800) truncate">{m.user.name}</span>
                {(normalizeRole(m.user.role) === 'lead') && (
                  <span className="ml-1.5 text-[10px] font-medium text-(--rs-accent-600) uppercase tracking-wide">Lead</span>
                )}
              </div>
              {m.report?.submittedAt ? (
                <span className="shrink-0 flex items-center gap-1 text-xs text-green-600">
                  <CheckCircle2 className="w-3 h-3" /> Submitted
                </span>
              ) : (
                <span className="shrink-0 flex items-center gap-1 text-xs text-(--rs-neutral-grey-400)">
                  <AlertCircle className="w-3 h-3" /> Pending
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Expand / collapse highlights */}
        {submitted > 0 && (
          <button
            onClick={() => setOpen(o => !o)}
            className="w-full flex items-center justify-center gap-1 mt-2 py-1.5 text-xs text-(--rs-primary-500) hover:text-(--rs-primary-700) transition-colors"
          >
            {open ? <><ChevronUp className="w-3.5 h-3.5" /> Hide report highlights</> : <><ChevronDown className="w-3.5 h-3.5" /> View report highlights</>}
          </button>
        )}

        {/* Highlights */}
        {open && (
          <div className="border-t border-(--rs-neutral-grey-100) pt-3 space-y-4">
            {group.members.filter(m => m.report?.submittedAt).map(m => {
              const r = m.report!;
              const hasContent = r.clientEngagements.length > 0 || r.risks.length > 0 || (r.meetings?.length ?? 0) > 0 || r.ideas;
              return (
                <div key={m.user.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-(--rs-neutral-grey-200) flex items-center justify-center text-[9px] font-bold text-(--rs-neutral-grey-600)">
                      {initials(m.user.name)}
                    </div>
                    <span className="text-xs font-semibold text-(--rs-neutral-grey-700)">{m.user.name}</span>
                    <span className="text-[10px] text-(--rs-neutral-grey-400)">{fmtDateTime(r.submittedAt!)}</span>
                  </div>

                  {!hasContent && <p className="text-xs text-(--rs-neutral-grey-400) italic ml-7">No entries in report.</p>}

                  {r.clientEngagements.length > 0 && (
                    <div className="ml-7 space-y-0.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-(--rs-neutral-grey-400)">Engagements</p>
                      {r.clientEngagements.map((e, i) => (
                        <p key={i} className="text-xs text-(--rs-neutral-grey-700)">• {e.activity}{e.details ? ` — ${e.details}` : ''}</p>
                      ))}
                    </div>
                  )}

                  {r.risks.length > 0 && (
                    <div className="ml-7 space-y-0.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-(--rs-neutral-grey-400)">Risks</p>
                      {r.risks.map((risk, i) => (
                        <p key={i} className={`text-xs ${risk.escalation === 'Yes' ? 'text-red-600 font-medium' : 'text-(--rs-neutral-grey-700)'}`}>
                          • {risk.description}{risk.escalation === 'Yes' ? ' ⚠ Escalation needed' : ''}
                        </p>
                      ))}
                    </div>
                  )}

                  {r.meetings && r.meetings.length > 0 && (
                    <div className="ml-7 space-y-0.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-(--rs-neutral-grey-400)">Meetings</p>
                      {r.meetings.map((mtg, i) => (
                        <p key={i} className="text-xs text-(--rs-neutral-grey-700)">
                          • {mtg.title}{mtg.participants ? ` — ${mtg.participants}` : ''}{mtg.notes ? ` (${mtg.notes})` : ''}
                        </p>
                      ))}
                    </div>
                  )}

                  {r.ideas && (
                    <div className="ml-7">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-(--rs-neutral-grey-400)">Ideas</p>
                      <p className="text-xs text-(--rs-neutral-grey-700) whitespace-pre-line">{r.ideas}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function CeoReportsOverview() {
  const [weekOffset, setWeekOffset] = useState(0);
  const monday = getMondayDate(weekOffset);
  const friday = new Date(monday.getTime() + 4 * 86400000);
  const weekStart = toLocalISO(monday);

  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [members, setMembers] = useState<MemberReport[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/weekly-report/team?week=${weekStart}`)
      .then(r => r.json())
      .then((d: { members?: MemberReport[]; error?: string }) => {
        if (cancelled) return;
        if (d.error) { setError(d.error); return; }
        setMembers(d.members ?? []);
      })
      .catch(() => { if (!cancelled) setError('Failed to load reports.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [weekStart]);

  function changeWeekOffset(updater: number | ((value: number) => number)) {
    setLoading(true);
    setError('');
    setWeekOffset(updater);
  }

  // Group members by team
  const groups = members.reduce<Record<string, MemberReport[]>>((acc, m) => {
    const key = m.user.team ?? 'Unassigned';
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {});

  const teamGroups: TeamGroup[] = Object.entries(groups)
    .map(([team, mems]) => ({ team, members: mems }))
    .sort((a, b) => a.team.localeCompare(b.team));

  const totalMembers   = members.length;
  const totalSubmitted = members.filter(m => m.report?.submittedAt).length;
  const totalEscalations = members.flatMap(m => (m.report?.risks ?? []).filter(r => r.escalation === 'Yes')).length;
  const exportRows = members.map(member => ({
    member: member.user.name,
    team: member.user.team ?? 'Unassigned',
    role: member.user.role,
    job_title: member.user.jobTitle ?? '',
    submitted: member.report?.submittedAt ? 'Yes' : 'No',
    submitted_at: member.report?.submittedAt ?? '',
    engagements: member.report?.clientEngagements.length ?? 0,
    meetings: member.report?.meetings.length ?? 0,
    risks: member.report?.risks.length ?? 0,
    escalations: (member.report?.risks ?? []).filter(r => r.escalation === 'Yes').length,
    ideas: member.report?.ideas ?? '',
  }));

  return (
    <div className="space-y-5">
      {/* Week navigator */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="icon" onClick={() => changeWeekOffset(w => w - 1)}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-medium text-(--rs-neutral-grey-900) min-w-44 text-center">
          {fmtDate(monday)} – {fmtDate(friday)}
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
            baseName={`weekly_reports_overview_${weekStart}`}
            rows={exportRows}
            jsonData={{
              weekStart,
              totals: { members: totalMembers, submitted: totalSubmitted, escalations: totalEscalations, teams: teamGroups.length },
              members,
            }}
            title="Export Reports"
          />
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">{error}</div>}

      {loading ? (
        <div className="flex items-center gap-2 text-(--rs-neutral-grey-500)">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading all reports…</span>
        </div>
      ) : (
        <>
          {/* Summary bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white border border-(--rs-neutral-grey-200) rounded-lg px-4 py-3 text-center">
              <div className="text-2xl font-bold text-(--rs-neutral-grey-900)">{totalSubmitted}<span className="text-base font-normal text-(--rs-neutral-grey-400)">/{totalMembers}</span></div>
              <div className="text-xs text-(--rs-neutral-grey-500) mt-0.5">Reports submitted</div>
            </div>
            <div className="bg-white border border-(--rs-neutral-grey-200) rounded-lg px-4 py-3 text-center">
              <div className="text-2xl font-bold text-(--rs-neutral-grey-900)">{teamGroups.length}</div>
              <div className="text-xs text-(--rs-neutral-grey-500) mt-0.5">Teams</div>
            </div>
            <div className={`border rounded-lg px-4 py-3 text-center ${totalEscalations > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-(--rs-neutral-grey-200)'}`}>
              <div className={`text-2xl font-bold ${totalEscalations > 0 ? 'text-red-700' : 'text-(--rs-neutral-grey-900)'}`}>{totalEscalations}</div>
              <div className={`text-xs mt-0.5 ${totalEscalations > 0 ? 'text-red-500' : 'text-(--rs-neutral-grey-500)'}`}>Escalations</div>
            </div>
          </div>

          {/* Team cards */}
          <div className="grid gap-4 md:grid-cols-2">
            {teamGroups.map(group => <TeamCard key={group.team} group={group} />)}
          </div>

          {teamGroups.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-(--rs-neutral-grey-400) text-sm italic">
                No team members found.
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
