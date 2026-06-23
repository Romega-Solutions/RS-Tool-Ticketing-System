import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import {
  Sun, Users2, TrendingUp, UserPlus2, AlertTriangle,
  Lightbulb, Clock, Trophy, XCircle, Sparkles, AlertCircle,
  History, ChevronRight, CalendarRange, Filter,
} from 'lucide-react';
import { LeadToolHeader, StatCard } from '@/components/lead-tool-header';
import { ToolResetButton } from '@/components/tool-reset-button';
import { getSession } from '@/lib/session';
import { hasToolAccess } from '@/lib/rbac';
import {
  getLatestBriefing,
  getBriefingForDate,
  getRecentBriefings,
  type BriefingStats,
} from '@/lib/briefing';
import { RegenerateButton } from './regenerate-button';
import { deleteAllBriefings } from './actions';

const PHP = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return iso; }
}

function formatDay(ymd: string) {
  try {
    return new Date(`${ymd}T12:00:00+08:00`).toLocaleDateString('en-PH', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch { return ymd; }
}

function formatShortDay(ymd: string) {
  try {
    return new Date(`${ymd}T12:00:00+08:00`).toLocaleDateString('en-PH', {
      month: 'short', day: 'numeric',
    });
  } catch { return ymd; }
}

function summarizeNarrative(text: string | null) {
  if (!text) return 'Stats saved without an AI narrative.';
  return text.length > 112 ? `${text.slice(0, 109).trimEnd()}...` : text;
}

type PageProps = {
  searchParams: Promise<{ date?: string; history?: string }>;
};

export default async function CeoBriefingPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session || !hasToolAccess('ceo', session.role, session.toolAccess)) {
    redirect('/dashboard');
  }

  const { date, history = 'all' } = await searchParams;
  const [latestBriefing, recentBriefings] = await Promise.all([
    getLatestBriefing(),
    getRecentBriefings(14),
  ]);

  const selectedBriefing =
    date ? await getBriefingForDate(date) : latestBriefing;

  const briefing = selectedBriefing ?? latestBriefing;

  if (!briefing) {
    return (
      <div className="space-y-6">
        <LeadToolHeader
          eyebrow="CEO tool"
          title="Daily Executive Briefing"
          description="Yesterday's snapshot in one glance: people, pipeline, recruiting, risks. Updated daily at 7 AM PHT."
          action={<RegenerateButton variant="default" />}
        />
        <Card>
          <CardContent className="p-10 text-center animate-lead-card">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-(--rs-primary-50)">
              <Sun className="h-6 w-6 text-(--rs-primary-500)" />
            </div>
            <p className="text-sm font-semibold text-(--rs-neutral-grey-900)">No briefing yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-(--rs-neutral-grey-500)">
              The daily cron hasn&apos;t run yet, or the <code className="rounded bg-(--rs-neutral-grey-100) px-1">briefings</code> table
              isn&apos;t set up. Run{' '}
              <code className="rounded bg-(--rs-neutral-grey-100) px-1">docs/migrations/add-briefings-table.sql</code>{' '}
              in Supabase, then click <strong>Regenerate</strong>.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const s: BriefingStats = briefing.stats;
  const isViewingHistory = briefing.date !== latestBriefing?.date;
  const historyFilter = ['all', 'risks', 'quiet', 'missing-ai'].includes(history) ? history : 'all';
  const filteredBriefings = recentBriefings.filter(item => {
    if (historyFilter === 'risks') return item.stats.reports.risks.length > 0;
    if (historyFilter === 'quiet') return item.stats.reports.risks.length === 0 && item.stats.pipeline.new_leads === 0;
    if (historyFilter === 'missing-ai') return !item.narrative;
    return true;
  });

  return (
    <div className="space-y-6">
      <LeadToolHeader
        eyebrow="CEO tool"
        title="Daily Executive Briefing"
        description={`Viewing ${formatDay(s.date)}. Generated ${formatDate(briefing.generated_at)}${briefing.model ? ` · ${briefing.model}` : ''}.`}
        action={
          <div className="flex flex-wrap items-start justify-end gap-2">
            <ToolResetButton
              label="Reset briefings"
              description="Deletes all saved CEO briefing rows from Supabase. Cron and manual regenerate can recreate them later."
              confirmationText="DELETE BRIEFINGS"
              action={deleteAllBriefings}
            />
            <RegenerateButton />
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <main className="space-y-6">
          {isViewingHistory && latestBriefing && (
            <Card className="animate-lead-card border-(--rs-accent-200) bg-linear-to-r from-(--rs-accent-50) via-white to-(--rs-primary-50)">
              <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-white p-2 text-(--rs-accent-700) shadow-sm ring-1 ring-(--rs-accent-100)">
                    <History className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-(--rs-accent-700)">History view</p>
                    <p className="mt-1 text-sm text-(--rs-neutral-grey-700)">
                      You&apos;re viewing an earlier briefing. Jump back to the latest snapshot anytime.
                    </p>
                  </div>
                </div>
                <Link
                  href="/ceo/briefing"
                  className="inline-flex items-center gap-2 rounded-lg border border-(--rs-accent-200) bg-white px-3 py-2 text-sm font-semibold text-(--rs-accent-800) transition-colors hover:bg-(--rs-accent-50)"
                >
                  View latest
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </CardContent>
            </Card>
          )}

          <Card className="animate-lead-card border-(--rs-neutral-grey-200) bg-linear-to-br from-white via-white to-(--rs-primary-50)/40">
            <CardContent className="p-4 md:p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-(--rs-accent-700)">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Executive summary</span>
                  </div>
                  <h2 className="mt-2 font-serif text-xl font-bold text-(--rs-neutral-grey-900)">
                    {formatDay(s.date)}
                  </h2>
                  <p className="mt-1 text-sm text-(--rs-neutral-grey-500)">
                    {isViewingHistory ? 'Historical snapshot' : 'Latest daily snapshot'} for people, pipeline, recruiting, and report signals.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm md:min-w-[260px]">
                  <MetaChip label="Reports" value={String(s.reports.submitted_count)} />
                  <MetaChip label="Risks" value={String(s.reports.risks.length)} />
                  <MetaChip label="Leads" value={String(s.pipeline.new_leads)} />
                  <MetaChip label="Candidates" value={String(s.recruiting.new_candidates)} />
                </div>
              </div>

              {briefing.narrative ? (
                <p className="mt-5 border-t border-(--rs-neutral-grey-100) pt-5 font-serif text-base leading-relaxed text-(--rs-neutral-grey-900)">
                  {briefing.narrative}
                </p>
              ) : (
                <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-(--rs-neutral-grey-700)">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p className="text-sm">
                    Stats were saved, but the AI narrative failed to generate.
                    Check <code className="rounded bg-white px-1">GROQ_API_KEY</code> and try Regenerate.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Section title="People" icon={<Users2 className="h-4 w-4" />}>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard icon={<Users2 className="h-4 w-4" />} label="Clocked in"
                value={`${s.people.clocked_in} / ${s.people.total_active}`}
                hint={`${s.people.total_hours.toFixed(1)} hrs total`} />
              <StatCard icon={<Clock className="h-4 w-4" />} label="Late"
                value={String(s.people.late.length)}
                hint={s.people.late.length ? s.people.late.slice(0, 2).join(', ') : 'on time'} />
              <StatCard icon={<AlertCircle className="h-4 w-4" />} label="No clock-in"
                value={String(s.people.no_clock_in.length)}
                hint={s.people.no_clock_in.length ? s.people.no_clock_in.slice(0, 2).join(', ') : 'all present'} />
              <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Avg hours"
                value={s.people.clocked_in ? (s.people.total_hours / s.people.clocked_in).toFixed(1) : '0.0'}
                hint="per active person" />
            </div>
            {s.people.no_clock_in.length > 0 && (
              <NameList title="Did not clock in" names={s.people.no_clock_in} tint="red" />
            )}
            {s.people.late.length > 0 && (
              <NameList title="Late (after 9:15 AM)" names={s.people.late} tint="amber" />
            )}
          </Section>

          <Section title="Sales pipeline" icon={<TrendingUp className="h-4 w-4" />}>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard icon={<Sparkles className="h-4 w-4" />} label="New leads"
                value={String(s.pipeline.new_leads)}
                hint={s.pipeline.new_lead_value ? PHP.format(s.pipeline.new_lead_value) : '—'} />
              <StatCard icon={<Trophy className="h-4 w-4" />} label="Won"
                value={String(s.pipeline.leads_won_today)}
                accent hint="closed yesterday" />
              <StatCard icon={<XCircle className="h-4 w-4" />} label="Lost"
                value={String(s.pipeline.leads_lost_today)} hint="closed yesterday" />
              <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Open pipeline"
                value={String(s.pipeline.open_count)}
                hint={PHP.format(s.pipeline.open_value)} />
            </div>
          </Section>

          <Section title="Recruiting" icon={<UserPlus2 className="h-4 w-4" />}>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard icon={<Sparkles className="h-4 w-4" />} label="New candidates"
                value={String(s.recruiting.new_candidates)} />
              <StatCard icon={<Users2 className="h-4 w-4" />} label="To interview"
                value={String(s.recruiting.moved_to_interview)} />
              <StatCard icon={<Trophy className="h-4 w-4" />} label="Hired"
                value={String(s.recruiting.hired_today)} accent />
              <StatCard icon={<UserPlus2 className="h-4 w-4" />} label="Open pipeline"
                value={String(s.recruiting.open_count)} />
            </div>
          </Section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="animate-lead-card [animation-delay:120ms]">
              <CardContent className="p-5">
                <SubHead icon={<AlertTriangle className="h-4 w-4" />} text={`Risks · ${s.reports.risks.length}`} tint="red" />
                {s.reports.risks.length === 0 ? (
                  <p className="mt-2 text-sm text-(--rs-neutral-grey-500)">No risks flagged yesterday.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {s.reports.risks.map((r, i) => (
                      <li key={i} className="text-sm">
                        <span className="font-semibold text-(--rs-neutral-grey-900)">{r.name}</span>
                        <p className="mt-0.5 whitespace-pre-wrap leading-snug text-(--rs-neutral-grey-700)">{r.text}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="animate-lead-card [animation-delay:180ms]">
              <CardContent className="p-5">
                <SubHead icon={<Lightbulb className="h-4 w-4" />} text={`Ideas · ${s.reports.ideas.length}`} tint="amber" />
                {s.reports.ideas.length === 0 ? (
                  <p className="mt-2 text-sm text-(--rs-neutral-grey-500)">No new ideas submitted yesterday.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {s.reports.ideas.map((r, i) => (
                      <li key={i} className="text-sm">
                        <span className="font-semibold text-(--rs-neutral-grey-900)">{r.name}</span>
                        <p className="mt-0.5 whitespace-pre-wrap leading-snug text-(--rs-neutral-grey-700)">{r.text}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="animate-fade-in pt-2 text-center text-xs text-(--rs-neutral-grey-400) [animation-delay:240ms]">
            Tokens: in={briefing.tokens_in ?? 0} · out={briefing.tokens_out ?? 0}
            {briefing.tokens_in != null && briefing.tokens_out != null &&
              ` · ~${(((briefing.tokens_in + briefing.tokens_out) / 1_000_000) * 0.59).toFixed(4)} USD if on paid tier`}
          </div>
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
                  <h2 className="mt-2 font-serif text-lg font-bold text-(--rs-neutral-grey-900)">Previous briefings</h2>
                </div>
                <span className="rounded-full bg-(--rs-primary-50) px-2 py-1 text-[11px] font-semibold text-(--rs-primary-700)">
                  {recentBriefings.length} days
                </span>
              </div>

              <p className="mt-2 text-sm leading-relaxed text-(--rs-neutral-grey-500)">
                Open any earlier snapshot to compare narrative, risks, and activity by day.
              </p>

              <form className="mt-4">
                <label className="relative block">
                  <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--rs-neutral-grey-400)" />
                  <select
                    name="history"
                    defaultValue={historyFilter}
                    className="w-full rounded-lg border border-(--rs-neutral-grey-200) bg-white py-2 pl-9 pr-3 text-sm text-(--rs-neutral-grey-900) outline-none transition-colors focus:border-(--rs-primary-300) focus:ring-3 focus:ring-(--rs-primary-100)"
                  >
                    <option value="all">All snapshots</option>
                    <option value="risks">With risks</option>
                    <option value="quiet">Quiet days</option>
                    <option value="missing-ai">Missing AI narrative</option>
                  </select>
                </label>
                {date && <input type="hidden" name="date" value={date} />}
                <div className="mt-2 flex gap-2">
                  <button className="rounded-lg bg-(--rs-primary-500) px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-(--rs-primary-600)">
                    Apply
                  </button>
                  <a
                    href={date ? `/ceo/briefing?date=${date}` : '/ceo/briefing'}
                    className="rounded-lg border border-(--rs-neutral-grey-200) bg-white px-3 py-1.5 text-xs font-semibold text-(--rs-neutral-grey-700) transition-colors hover:bg-(--rs-neutral-grey-100)"
                  >
                    Reset
                  </a>
                </div>
              </form>

              {date && !selectedBriefing && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  No saved briefing for <strong>{date}</strong>. Showing the latest available day instead.
                </div>
              )}

              <div className="mt-4 space-y-2">
                {filteredBriefings.map((item, index) => {
                  const active = item.date === briefing.date;
                  const isLatest = item.date === latestBriefing?.date;
                  return (
                    <Link
                      key={item.date}
                      href={item.date === latestBriefing?.date ? '/ceo/briefing' : `/ceo/briefing?date=${item.date}`}
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
                            <p className="font-semibold text-(--rs-neutral-grey-900)">{formatShortDay(item.date)}</p>
                            {isLatest && (
                              <span className="rounded-full bg-(--rs-accent-100) px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-(--rs-accent-800)">
                                Latest
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-(--rs-neutral-grey-500)">{formatDay(item.date)}</p>
                        </div>
                        <ChevronRight className={`mt-0.5 h-4 w-4 shrink-0 ${active ? 'text-(--rs-primary-600)' : 'text-(--rs-neutral-grey-300)'}`} />
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                        <HistoryStat label="Reports" value={item.stats.reports.submitted_count} />
                        <HistoryStat label="Risks" value={item.stats.reports.risks.length} />
                        <HistoryStat label="Leads" value={item.stats.pipeline.new_leads} />
                      </div>

                      <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-(--rs-neutral-grey-600)">
                        {summarizeNarrative(item.narrative)}
                      </p>
                    </Link>
                  );
                })}
                {filteredBriefings.length === 0 && (
                  <div className="rounded-xl border border-dashed border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) px-3 py-6 text-center text-sm text-(--rs-neutral-grey-500)">
                    No briefings match this filter.
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
  return (
    <h3 className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest ${color}`}>
      {icon}{text}
    </h3>
  );
}

function NameList({ title, names, tint }: { title: string; names: string[]; tint: 'red' | 'amber' }) {
  const bg = tint === 'red' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700';
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-(--rs-neutral-grey-500)">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {names.map((n, i) => (
          <span key={i} className={`rounded-md px-2 py-0.5 text-xs font-medium ${bg}`}>{n}</span>
        ))}
      </div>
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white/85 px-3 py-2 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wider text-(--rs-neutral-grey-500)">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-(--rs-neutral-grey-900)">{value}</p>
    </div>
  );
}

function HistoryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-(--rs-neutral-grey-50) px-2 py-1.5 text-center">
      <p className="text-[10px] font-bold uppercase tracking-wide text-(--rs-neutral-grey-500)">{label}</p>
      <p className="mt-0.5 text-xs font-semibold tabular-nums text-(--rs-neutral-grey-900)">{value}</p>
    </div>
  );
}
