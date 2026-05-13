import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertCircle, AlertTriangle, CalendarRange, ChevronRight, Clock,
  FileText, History, Lightbulb, TrendingUp, Users, Filter,
} from 'lucide-react';
import { LeadToolHeader, StatCard } from '@/components/lead-tool-header';
import { ToolResetButton } from '@/components/tool-reset-button';
import { getSession } from '@/lib/session';
import { canAccessLeadTool } from '@/lib/rbac';
import {
  currentWeekStartPht,
  getLatestStatusDraft,
  getRecentStatusDrafts,
  getStatusDraftForWeek,
  type StatusDraftStats,
} from '@/lib/status-drafter';
import { RegenerateStatusDraftButton } from './regenerate-button';
import { deleteAllStatusDrafts } from './actions';

function formatDay(ymd: string) {
  try {
    return new Date(`${ymd}T12:00:00+08:00`).toLocaleDateString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return ymd;
  }
}

function formatWeek(weekStart: string, weekEnd: string) {
  return `${formatDay(weekStart)} - ${formatDay(weekEnd)}`;
}

type PageProps = {
  searchParams: Promise<{ week?: string; history?: string }>;
};

export default async function StatusDrafterPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session || !canAccessLeadTool('pm', session.role, session.team)) {
    redirect('/dashboard');
  }

  const { week, history = 'all' } = await searchParams;
  const [latestDraft, recentDrafts] = await Promise.all([
    getLatestStatusDraft(),
    getRecentStatusDrafts(12),
  ]);

  const selectedDraft = week ? await getStatusDraftForWeek(week) : latestDraft;
  const draft = selectedDraft ?? latestDraft;
  const liveWeek = currentWeekStartPht();

  if (!draft) {
    return (
      <div className="space-y-6">
        <LeadToolHeader
          eyebrow="Project Manager tool"
          title="AI Weekly Status Drafter"
          description="Every Friday at 4 PM, n8n collects weekly reports, timesheets, and attendance from Supabase. Groq drafts a stakeholder-ready summary in Romega's tone."
          action={<RegenerateStatusDraftButton variant="default" />}
        />
        <Card className="animate-lead-card">
          <CardContent className="p-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-(--rs-primary-50)">
              <FileText className="h-6 w-6 text-(--rs-primary-500)" />
            </div>
            <p className="text-sm font-semibold text-(--rs-neutral-grey-900)">No weekly draft yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-(--rs-neutral-grey-500)">
              Run <code className="rounded bg-(--rs-neutral-grey-100) px-1">docs/migrations/add-status-drafts-and-content-drafts.sql</code>,
              then click <strong>Regenerate</strong> or activate the PM n8n workflow.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stats: StatusDraftStats = draft.stats;
  const viewingHistory = draft.week_start !== latestDraft?.week_start;
  const historyFilter = ['all', 'missing', 'risks', 'complete'].includes(history) ? history : 'all';
  const filteredDrafts = recentDrafts.filter(item => {
    if (historyFilter === 'missing') return item.stats.coverage.missing_reports.length > 0;
    if (historyFilter === 'risks') return item.stats.risks.length > 0;
    if (historyFilter === 'complete') return item.stats.coverage.missing_reports.length === 0 && item.stats.risks.length === 0;
    return true;
  });

  return (
    <div className="space-y-6">
      <LeadToolHeader
        eyebrow="Project Manager tool"
        title="AI Weekly Status Drafter"
        description={`Week of ${formatWeek(stats.week_start, stats.week_end)}. Generated ${new Date(draft.generated_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}${draft.model ? ` · ${draft.model}` : ''}.`}
        action={
          <div className="flex flex-wrap items-start justify-end gap-2">
            <ToolResetButton
              label="Reset status drafts"
              description="Deletes all saved weekly status draft rows from Supabase. The Friday workflow or regenerate button can rebuild them."
              confirmationText="DELETE STATUS DRAFTS"
              action={deleteAllStatusDrafts}
            />
            <RegenerateStatusDraftButton />
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <main className="space-y-6">
          {viewingHistory && latestDraft && (
            <Card className="animate-lead-card border-(--rs-accent-200) bg-linear-to-r from-(--rs-accent-50) via-white to-(--rs-primary-50)">
              <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-white p-2 text-(--rs-accent-700) shadow-sm ring-1 ring-(--rs-accent-100)">
                    <History className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-(--rs-accent-700)">History view</p>
                    <p className="mt-1 text-sm text-(--rs-neutral-grey-700)">
                      You&apos;re viewing an older weekly draft. Jump back to the latest status summary anytime.
                    </p>
                  </div>
                </div>
                <Link
                  href="/pm/status-drafter"
                  className="inline-flex items-center gap-2 rounded-lg border border-(--rs-accent-200) bg-white px-3 py-2 text-sm font-semibold text-(--rs-accent-800) transition-colors hover:bg-(--rs-accent-50)"
                >
                  View latest
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </CardContent>
            </Card>
          )}

          {draft.draft ? (
            <Card className="animate-lead-card border-(--rs-neutral-grey-200) bg-linear-to-br from-white via-white to-(--rs-primary-50)/40">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-(--rs-primary-700)">
                  <FileText className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Stakeholder draft</span>
                </div>
                <p className="mt-4 whitespace-pre-wrap font-serif text-base leading-relaxed text-(--rs-neutral-grey-900)">
                  {draft.draft}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="animate-lead-card">
              <CardContent className="flex items-start gap-3 p-4 text-(--rs-neutral-grey-600)">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-sm">
                  Stats were saved, but the AI summary failed to generate. Check <code className="rounded bg-(--rs-neutral-grey-100) px-1">GROQ_API_KEY</code> and regenerate.
                </p>
              </CardContent>
            </Card>
          )}

          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={<Users className="h-4 w-4" />} label="Reports in" value={`${stats.coverage.reports_submitted} / ${stats.coverage.total_active}`} hint="weekly report coverage" />
            <StatCard icon={<CalendarRange className="h-4 w-4" />} label="Attendance" value={String(stats.coverage.attendance_submitted)} hint="attendance rows submitted" />
            <StatCard icon={<Clock className="h-4 w-4" />} label="Hours logged" value={stats.coverage.total_hours.toFixed(1)} hint="teamwide this week" />
            <StatCard icon={<AlertTriangle className="h-4 w-4" />} label="Risks" value={String(stats.risks.length)} hint="flagged in reports" accent />
          </section>

          <Section title="Team rollup" icon={<TrendingUp className="h-4 w-4" />}>
            <div className="grid gap-4 md:grid-cols-2">
              {stats.teams.map((team, index) => (
                <Card key={team.team} className="animate-lead-card" style={{ animationDelay: `${Math.min(index * 50, 220)}ms` }}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">{team.team}</p>
                        <p className="text-xs text-(--rs-neutral-grey-500)">{team.member_count} active members</p>
                      </div>
                      <span className="rounded-full bg-(--rs-primary-50) px-2 py-1 text-[11px] font-semibold text-(--rs-primary-700)">
                        {team.hours.toFixed(1)} hrs
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                      <MiniStat label="Reports" value={`${team.submitted_reports}/${team.member_count}`} />
                      <MiniStat label="Attendance" value={String(team.attendance_submitted)} />
                      <MiniStat label="Engagements" value={String(team.engagements)} />
                      <MiniStat label="Ideas" value={String(team.ideas)} />
                    </div>
                    {team.highlights.length > 0 && (
                      <ul className="mt-4 space-y-1.5 text-sm text-(--rs-neutral-grey-700)">
                        {team.highlights.map((item, i) => (
                          <li key={i} className="rounded-lg bg-(--rs-neutral-grey-50) px-2.5 py-2">{item}</li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="animate-lead-card [animation-delay:120ms]">
              <CardContent className="p-5">
                <SubHead icon={<AlertTriangle className="h-4 w-4" />} text={`Risks · ${stats.risks.length}`} tint="red" />
                {stats.risks.length === 0 ? (
                  <p className="mt-2 text-sm text-(--rs-neutral-grey-500)">No risks captured in weekly reports.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {stats.risks.map((risk, i) => (
                      <li key={i} className="text-sm">
                        <span className="font-semibold text-(--rs-neutral-grey-900)">{risk.name}</span>
                        <span className="ml-2 text-xs text-(--rs-neutral-grey-500)">· {risk.team}</span>
                        <p className="mt-1 leading-snug text-(--rs-neutral-grey-700)">{risk.text}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="animate-lead-card [animation-delay:180ms]">
              <CardContent className="p-5">
                <SubHead icon={<Lightbulb className="h-4 w-4" />} text={`Ideas · ${stats.ideas.length}`} tint="amber" />
                {stats.ideas.length === 0 ? (
                  <p className="mt-2 text-sm text-(--rs-neutral-grey-500)">No ideas captured in weekly reports.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {stats.ideas.map((idea, i) => (
                      <li key={i} className="text-sm">
                        <span className="font-semibold text-(--rs-neutral-grey-900)">{idea.name}</span>
                        <span className="ml-2 text-xs text-(--rs-neutral-grey-500)">· {idea.team}</span>
                        <p className="mt-1 leading-snug text-(--rs-neutral-grey-700)">{idea.text}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {(stats.coverage.missing_reports.length > 0 || stats.low_hours.length > 0) && (
            <Section title="Follow-up needed" icon={<AlertCircle className="h-4 w-4" />}>
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="animate-lead-card">
                  <CardContent className="p-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-red-700">Missing reports</p>
                    {stats.coverage.missing_reports.length === 0 ? (
                      <p className="mt-2 text-sm text-(--rs-neutral-grey-500)">Everyone submitted.</p>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {stats.coverage.missing_reports.map(name => (
                          <span key={name} className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">{name}</span>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="animate-lead-card">
                  <CardContent className="p-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-amber-700">Low hours</p>
                    {stats.low_hours.length === 0 ? (
                      <p className="mt-2 text-sm text-(--rs-neutral-grey-500)">No low-hour outliers.</p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {stats.low_hours.map(item => (
                          <li key={`${item.name}-${item.team}`} className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                            <span>{item.name} <span className="text-xs text-amber-700">· {item.team}</span></span>
                            <span className="font-semibold tabular-nums">{item.hours.toFixed(1)}h</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            </Section>
          )}
        </main>

        <aside className="space-y-4">
          <Card className="animate-lead-card border-(--rs-neutral-grey-200) xl:sticky xl:top-6">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-(--rs-primary-700)">
                    <CalendarRange className="h-4 w-4" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em]">History</span>
                  </div>
                  <h2 className="mt-2 font-serif text-lg font-bold text-(--rs-neutral-grey-900)">Weekly drafts</h2>
                </div>
                <span className="rounded-full bg-(--rs-primary-50) px-2 py-1 text-[11px] font-semibold text-(--rs-primary-700)">
                  {recentDrafts.length} weeks
                </span>
              </div>

              <p className="mt-2 text-sm leading-relaxed text-(--rs-neutral-grey-500)">
                Open prior drafts to compare coverage, risks, and delivery signal across weeks.
              </p>

              <form className="mt-4">
                <label className="relative block">
                  <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--rs-neutral-grey-400)" />
                  <select
                    name="history"
                    defaultValue={historyFilter}
                    className="w-full rounded-lg border border-(--rs-neutral-grey-200) bg-white py-2 pl-9 pr-3 text-sm text-(--rs-neutral-grey-900) outline-none transition-colors focus:border-(--rs-primary-300) focus:ring-3 focus:ring-(--rs-primary-100)"
                  >
                    <option value="all">All weekly drafts</option>
                    <option value="missing">Weeks with missing reports</option>
                    <option value="risks">Weeks with risks</option>
                    <option value="complete">Clean weeks</option>
                  </select>
                </label>
                {week && <input type="hidden" name="week" value={week} />}
                <div className="mt-2 flex gap-2">
                  <button className="rounded-lg bg-(--rs-primary-500) px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-(--rs-primary-600)">
                    Apply
                  </button>
                  <a
                    href={week ? `/pm/status-drafter?week=${week}` : '/pm/status-drafter'}
                    className="rounded-lg border border-(--rs-neutral-grey-200) bg-white px-3 py-1.5 text-xs font-semibold text-(--rs-neutral-grey-700) transition-colors hover:bg-(--rs-neutral-grey-100)"
                  >
                    Reset
                  </a>
                </div>
              </form>

              {week && !selectedDraft && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  No saved draft for <strong>{week}</strong>. Showing the latest available week instead.
                </div>
              )}

              {!recentDrafts.some(item => item.week_start === liveWeek) && (
                <div className="mt-4 rounded-xl border border-(--rs-primary-100) bg-(--rs-primary-50) p-3 text-sm text-(--rs-primary-800)">
                  This week&apos;s draft hasn&apos;t been generated yet. Use <strong>Regenerate</strong> or wait for Friday&apos;s workflow.
                </div>
              )}

              <div className="mt-4 space-y-2">
                {filteredDrafts.map((item, index) => {
                  const active = item.week_start === draft.week_start;
                  const isLatest = item.week_start === latestDraft?.week_start;
                  const itemStats = item.stats;
                  return (
                    <Link
                      key={item.week_start}
                      href={item.week_start === latestDraft?.week_start ? '/pm/status-drafter' : `/pm/status-drafter?week=${item.week_start}`}
                      className={`block rounded-xl border p-3 transition-all ${
                        active
                          ? 'border-(--rs-primary-300) bg-(--rs-primary-50) shadow-sm'
                          : 'border-(--rs-neutral-grey-200) bg-white hover:border-(--rs-primary-200) hover:bg-(--rs-neutral-grey-50)'
                      } animate-lead-card`}
                      style={{ animationDelay: `${Math.min(index * 45, 220)}ms` }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-(--rs-neutral-grey-900)">{formatDay(item.week_start)}</p>
                            {isLatest && (
                              <span className="rounded-full bg-(--rs-accent-100) px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-(--rs-accent-800)">
                                Latest
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-(--rs-neutral-grey-500)">{formatWeek(itemStats.week_start, itemStats.week_end)}</p>
                        </div>
                        <ChevronRight className={`mt-0.5 h-4 w-4 shrink-0 ${active ? 'text-(--rs-primary-600)' : 'text-(--rs-neutral-grey-300)'}`} />
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                        <MiniStat label="Reports" value={`${itemStats.coverage.reports_submitted}`} />
                        <MiniStat label="Risks" value={String(itemStats.risks.length)} />
                        <MiniStat label="Hours" value={itemStats.coverage.total_hours.toFixed(1)} />
                      </div>
                    </Link>
                  );
                })}
                {filteredDrafts.length === 0 && (
                  <div className="rounded-xl border border-dashed border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) px-3 py-6 text-center text-sm text-(--rs-neutral-grey-500)">
                    No weekly drafts match this filter.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3 animate-lead-card">
      <h2 className="flex items-center gap-2 font-serif text-base font-bold text-(--rs-neutral-grey-900)">
        <span className="text-(--rs-primary-600)">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function SubHead({ icon, text, tint }: { icon: React.ReactNode; text: string; tint: 'red' | 'amber' }) {
  const color = tint === 'red' ? 'text-red-700' : 'text-amber-700';
  return <h3 className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest ${color}`}>{icon}{text}</h3>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-(--rs-neutral-grey-50) px-2 py-1.5 text-center">
      <p className="text-[10px] font-bold uppercase tracking-wide text-(--rs-neutral-grey-500)">{label}</p>
      <p className="mt-0.5 text-xs font-semibold tabular-nums text-(--rs-neutral-grey-900)">{value}</p>
    </div>
  );
}
