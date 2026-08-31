import { Suspense, type ReactNode } from 'react';
import { getSession } from '@/lib/session';
import {
  describeDashboardActivity,
  getDashboardProjectActivity,
  getProjects,
  getProjectStates,
  getWorkspaceMembers,
  getWorkItems,
  buildStateLookup,
  enrichWorkItems,
} from '@/lib/tickets';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, AlertCircle, ArrowRight, CalendarDays, CheckCircle2, Circle, Clock, FileText, Flag, Users } from "lucide-react";
import Link from 'next/link';
import { HoursChart } from '@/components/hours-chart';
import { FxRateWidget } from '@/components/fx-rate-widget';
import { WeeklyHoursCard } from '@/components/weekly-hours-card';
import { LearningBanner } from '@/components/lms/learning-banner';

function stateGroup(item: { state_detail?: { group?: string } }) {
  return (item.state_detail?.group ?? '').toLowerCase();
}

function formatActivityTime(ts: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const PRIORITY_TONE: Record<string, { label: string; dot: string; text: string }> = {
  urgent: { label: 'Urgent', dot: 'bg-red-500', text: 'text-red-600' },
  high:   { label: 'High', dot: 'bg-orange-500', text: 'text-orange-600' },
  medium: { label: 'Medium', dot: 'bg-yellow-500', text: 'text-yellow-700' },
  low:    { label: 'Low', dot: 'bg-green-500', text: 'text-green-600' },
  none:   { label: 'No priority', dot: 'bg-slate-300', text: 'text-(--rs-neutral-grey-500)' },
};

function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function getTodayDayName(): string {
  return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];
}

type AttStatusRow = {
  monday_status: string | null;
  tuesday_status: string | null;
  wednesday_status: string | null;
  thursday_status: string | null;
  friday_status: string | null;
  saturday_status: string | null;
  sunday_status: string | null;
};

const OPEN_GROUPS = new Set(['backlog', 'unstarted', 'started', 'in_progress', 'inprogress', 'todo', 'in progress']);

export default async function DashboardPage() {
  const sessionUser = await getSession();

  const userId = sessionUser?.id
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('users')
    .select('approved_hours_per_week')
    .eq('id', userId)
    .single();
  
  const approvedHoursPerWeek = data?.approved_hours_per_week;

  const isFriday = new Date().getDay() === 5;

  return (
    <div className="space-y-6 overflow-x-hidden">
      <section className="rounded-xl border border-(--rs-neutral-grey-200) bg-white px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">Dashboard</h1>
            <p className="mt-1 max-w-2xl text-sm text-(--rs-neutral-grey-500)">
              Start with urgent work, then review team health, hours, and workspace activity.
            </p>
          </div>
          <Link
            href="/projects"
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-(--rs-neutral-grey-200) bg-white px-3 py-2 text-sm font-medium text-(--rs-primary-700) transition-colors hover:border-(--rs-primary-300) hover:bg-(--rs-primary-50)"
          >
            Projects <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {isFriday && (
        <div className="bg-(--rs-accent-100) border border-(--rs-accent-300) text-(--rs-accent-800) px-4 py-3 rounded-lg flex items-center gap-3 font-medium text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Weekly report due today at 11:59 PM — don&apos;t forget to submit.
        </div>
      )}

      <Suspense fallback={null}>
        <LearningBanner />
      </Suspense>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
        <FxRateWidget />
        <WeeklyHoursCard approvedHoursPerWeek={approvedHoursPerWeek} />
      </div>

      <Suspense fallback={<SummarySkeleton />}>
        <SummarySection />
      </Suspense>

      <Suspense fallback={<TicketsSkeleton />}>
        <TicketsSection
          userId={sessionUser ? String(sessionUser.id) : null}
          userEmail={sessionUser?.email ?? null}
        />
      </Suspense>

      <Suspense fallback={<HoursSkeleton />}>
        <HoursSection userId={sessionUser?.id ?? null} />
      </Suspense>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Summary cards (attendance today + weekly reports submitted)
   ────────────────────────────────────────────────────────────────── */
async function SummarySection() {
  let attendanceToday = { present: 0, total: 0 };
  let reportsSummary  = { submitted: 0, total: 0 };
  const weekStart = getWeekStart();

  try {
    const admin = createAdminClient();
    const dayCol = `${getTodayDayName()}_status` as keyof AttStatusRow;

    const [usersRes, attendRes, reportsRes] = await Promise.all([
      admin.from('users').select('id', { count: 'exact', head: true }).eq('is_active', 1),
      admin.from('attendance')
        .select('monday_status,tuesday_status,wednesday_status,thursday_status,friday_status,saturday_status,sunday_status')
        .eq('week_start', weekStart),
      admin.from('weekly_reports').select('submitted_at').eq('week_start', weekStart),
    ]);

    const total = usersRes.count ?? 0;
    const present = ((attendRes.data ?? []) as AttStatusRow[]).filter(r => {
      const val = r[dayCol];
      return val === 'present' || val === 'wfh';
    }).length;

    attendanceToday = { present, total };
    reportsSummary = {
      submitted: ((reportsRes.data ?? []) as { submitted_at: string | null }[]).filter(r => r.submitted_at).length,
      total,
    };
  } catch { /* best-effort */ }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Link href="/attendance">
        <Card className="hover:shadow-md hover:border-(--rs-primary-300) transition-all cursor-pointer h-full">
          <CardContent className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-(--rs-neutral-grey-500)">
                Attendance Today
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-(--rs-neutral-grey-900)">
                {attendanceToday.present}
                <span className="text-sm font-normal text-(--rs-neutral-grey-400)">
                  /{attendanceToday.total}
                </span>
              </p>
              <p className="text-xs text-(--rs-neutral-grey-400) mt-0.5">
                {attendanceToday.total > 0
                  ? `${Math.round((attendanceToday.present / attendanceToday.total) * 100)}% present or WFH`
                  : 'No records yet today'}
              </p>
            </div>
            <div className="w-10 h-10 rounded-full bg-(--rs-primary-50) flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-(--rs-primary-500)" />
            </div>
          </CardContent>
        </Card>
      </Link>

      <Link href="/weekly-report">
        <Card className="hover:shadow-md hover:border-(--rs-accent-300) transition-all cursor-pointer h-full">
          <CardContent className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-(--rs-neutral-grey-500)">
                Weekly Reports
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-(--rs-neutral-grey-900)">
                {reportsSummary.submitted}
                <span className="text-sm font-normal text-(--rs-neutral-grey-400)">
                  /{reportsSummary.total}
                </span>
              </p>
              <p className="text-xs text-(--rs-neutral-grey-400) mt-0.5">
                {reportsSummary.total - reportsSummary.submitted > 0
                  ? `${reportsSummary.total - reportsSummary.submitted} pending this week`
                  : 'All submitted this week'}
              </p>
            </div>
            <div className="w-10 h-10 rounded-full bg-(--rs-accent-50) flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-(--rs-accent-500)" />
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="flex items-center justify-between px-5 py-4">
            <div className="space-y-2 w-full">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="w-10 h-10 rounded-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Hours chart (timesheets for the signed-in user)
   ────────────────────────────────────────────────────────────────── */
async function HoursSection({ userId }: { userId: number | null }) {
  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  let weeklyData:  { day: string;  hours: number }[] = DAY_NAMES.map(d => ({ day: d, hours: 0 }));
  let monthlyData: { week: string; hours: number }[] = Array.from({ length: 4 }, (_, i) => ({ week: `Wk ${i + 1}`, hours: 0 }));
  let totalWeekHours  = 0;
  let totalMonthHours = 0;

  if (userId) {
    try {
      const admin    = createAdminClient();
      const weekStart = getWeekStart();
      const today    = new Date().toISOString().split('T')[0];
      const monthAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const { data: tsRows } = await admin
        .from('timesheets')
        .select('date, duration_seconds')
        .eq('user_id', userId)
        .gte('date', monthAgo)
        .lte('date', today)
        .not('duration_seconds', 'is', null);

      const rows = (tsRows ?? []) as { date: string; duration_seconds: number }[];

      const wkDates = DAY_NAMES.map((_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d.toISOString().split('T')[0];
      });
      weeklyData = DAY_NAMES.map((day, i) => {
        const secs = rows.filter(r => r.date === wkDates[i]).reduce((s, r) => s + (r.duration_seconds ?? 0), 0);
        return { day, hours: Math.round((secs / 3600) * 10) / 10 };
      });
      totalWeekHours = Math.round(weeklyData.reduce((s, d) => s + d.hours, 0) * 10) / 10;

      const wkStarts = Array.from({ length: 4 }, (_, i) => {
        const ms = new Date(weekStart);
        ms.setDate(ms.getDate() - (3 - i) * 7);
        return ms.toISOString().split('T')[0];
      });
      monthlyData = wkStarts.map((ws, i) => {
        const we = new Date(ws);
        we.setDate(we.getDate() + 7);
        const weStr = we.toISOString().split('T')[0];
        const secs = rows.filter(r => r.date >= ws && r.date < weStr).reduce((s, r) => s + (r.duration_seconds ?? 0), 0);
        return { week: `Wk ${i + 1}`, hours: Math.round((secs / 3600) * 10) / 10 };
      });
      totalMonthHours = Math.round(monthlyData.reduce((s, d) => s + d.hours, 0) * 10) / 10;
    } catch { /* best-effort */ }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-serif flex items-center gap-2">
          <Clock className="w-5 h-5 text-(--rs-primary-500)" /> My Hours
        </CardTitle>
      </CardHeader>
      <CardContent>
        <HoursChart
          weeklyData={weeklyData}
          monthlyData={monthlyData}
          totalWeekHours={totalWeekHours}
          totalMonthHours={totalMonthHours}
        />
      </CardContent>
    </Card>
  );
}

function HoursSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-serif flex items-center gap-2">
          <Clock className="w-5 h-5 text-(--rs-primary-500)" /> My Hours
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-48 w-full" />
      </CardContent>
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Tickets section (projects + my tasks + deadlines + workload + blockers)
   This is the slowest part of the page — N+1 over projects.
   ────────────────────────────────────────────────────────────────── */
type ItemMeta = {
  id: string;
  name: string;
  priority: string;
  assignees: string[];
  assignee_ids?: string[];
  target_date?: string | null;
  state_detail?: { id: string; name: string; group: string; color: string };
  label_detail?: Array<{ id: string; name: string; color: string }>;
  _projectId: string;
  _projectName: string;
  _projectIdentifier: string;
};

function PriorityBadge({ priority }: { priority: string }) {
  const tone = PRIORITY_TONE[priority] ?? PRIORITY_TONE.none;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${tone.text}`}>
      <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden="true" />
      {tone.label}
    </span>
  );
}

function SectionHeading({ id, title, description, action }: { id: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 id={id} className="text-lg font-serif font-semibold text-(--rs-neutral-grey-900)">{title}</h2>
        <p className="mt-0.5 text-sm text-(--rs-neutral-grey-500)">{description}</p>
      </div>
      {action}
    </div>
  );
}

async function TicketsSection({ userId, userEmail }: { userId: string | null; userEmail: string | null }) {
  let projects: Awaited<ReturnType<typeof getProjects>> = [];
  let members: Awaited<ReturnType<typeof getWorkspaceMembers>> = [];
  let recentActivity: Awaited<ReturnType<typeof getDashboardProjectActivity>> = [];
  let allItems: ItemMeta[] = [];
  let loadError: string | null = null;
  let activityError: string | null = null;

  try {
    [projects, members] = await Promise.all([getProjects(), getWorkspaceMembers()]);
    const [byProject, activityRows] = await Promise.all([
      Promise.all(
        projects.map(async p => {
          const [items, states] = await Promise.all([
            getWorkItems(p.id),
            getProjectStates(p.id),
          ]);
          const lookup = buildStateLookup(states);
          return enrichWorkItems(items, lookup).map(i => ({
            ...i,
            _projectId: p.id,
            _projectName: p.name,
            _projectIdentifier: p.identifier,
          }));
        }),
      ),
      getDashboardProjectActivity(6)
        .then(rows => ({ rows, error: null as string | null }))
        .catch(err => ({
          rows: [],
          error: err instanceof Error ? err.message : 'Failed to load activity',
        })),
    ]);
    allItems = byProject.flat();
    recentActivity = activityRows.rows;
    activityError = activityRows.error;
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Failed to load workspace data';
  }

  const projectStats = projects.map(p => {
    const items = allItems.filter(i => i._projectId === p.id);
    const open = items.filter(i => OPEN_GROUPS.has(stateGroup(i))).length;
    const done = items.filter(i => stateGroup(i) === 'completed').length;
    const blocked = items.filter(i =>
      i.label_detail?.some(l => l.name.toLowerCase().includes('blocker'))
    ).length;
    return { project: p, total: items.length, open, done, blocked };
  });

  const assignedToMe = (item: ItemMeta) =>
    (userId  !== null && item.assignee_ids?.includes(userId)) ||
    (userEmail !== null && item.assignees?.includes(userEmail));

  const myTasks = userId
    ? allItems.filter(i => OPEN_GROUPS.has(stateGroup(i)) && assignedToMe(i)).slice(0, 3)
    : [];

  const now = new Date();
  const in14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const deadlines = allItems
    .filter(i => {
      if (!i.target_date) return false;
      const d = new Date(i.target_date);
      return d >= now && d <= in14;
    })
    .sort((a, b) => new Date(a.target_date!).getTime() - new Date(b.target_date!).getTime())
    .slice(0, 4);

  const workload = members
    .map(m => ({
      member: m,
      count: allItems.filter(i =>
        OPEN_GROUPS.has(stateGroup(i)) &&
        (i.assignees?.includes(m.id) || i.assignee_ids?.includes(m.id))
      ).length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const maxLoad = Math.max(...workload.map(w => w.count), 1);

  const blockers = allItems
    .filter(i =>
      OPEN_GROUPS.has(stateGroup(i)) &&
      i.label_detail?.some(l => l.name.toLowerCase().includes('blocker'))
    )
    .slice(0, 4);

  const totalOpen = projectStats.reduce((sum, p) => sum + p.open, 0);
  const totalBlocked = projectStats.reduce((sum, p) => sum + p.blocked, 0);
  const activeProjects = projectStats.filter(p => p.open > 0).length;

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          Could not load project data. Try refreshing; if it persists, contact an admin.
        </div>
      )}

      <section className="space-y-3" aria-labelledby="workspace-priorities">
        <SectionHeading
          id="workspace-priorities"
          title="Workspace Priorities"
          description="Review blockers, assigned work, and deadlines before scanning project health."
          action={(
            <Link
              href="/projects"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-(--rs-primary-600) transition-colors hover:bg-(--rs-primary-50) hover:text-(--rs-primary-800)"
            >
              View projects <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card size="sm" className="border-l-4 border-l-red-400">
            <CardContent className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-500" aria-hidden="true" />
              <div>
                <p className="text-2xl font-bold tabular-nums text-(--rs-neutral-grey-900)">{totalBlocked}</p>
                <p className="text-xs text-(--rs-neutral-grey-500)">Active blockers</p>
              </div>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-(--rs-primary-500)" aria-hidden="true" />
              <div>
                <p className="text-2xl font-bold tabular-nums text-(--rs-neutral-grey-900)">{myTasks.length}</p>
                <p className="text-xs text-(--rs-neutral-grey-500)">My active tasks</p>
              </div>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5 shrink-0 text-(--rs-accent-600)" aria-hidden="true" />
              <div>
                <p className="text-2xl font-bold tabular-nums text-(--rs-neutral-grey-900)">{deadlines.length}</p>
                <p className="text-xs text-(--rs-neutral-grey-500)">Due in 14 days</p>
              </div>
            </CardContent>
          </Card>
          <Card size="sm">
            <CardContent className="flex items-center gap-3">
              <Flag className="h-5 w-5 shrink-0 text-green-600" aria-hidden="true" />
              <div>
                <p className="text-2xl font-bold tabular-nums text-(--rs-neutral-grey-900)">{activeProjects}</p>
                <p className="text-xs text-(--rs-neutral-grey-500)">{totalOpen} open tasks</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-1">
            <Card className="border-t-4 border-t-red-400">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="flex items-center gap-2 text-base font-serif text-red-600">
                  <AlertCircle className="h-4 w-4" aria-hidden="true" /> Active Blockers
                </CardTitle>
                <Link href="/projects" className="inline-flex items-center gap-1 text-sm font-medium text-(--rs-primary-500) hover:text-(--rs-primary-700)">
                  Open board <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </CardHeader>
              <CardContent>
                {blockers.length === 0 ? (
                  <div className="flex min-h-24 items-center gap-2 rounded-lg border border-green-100 bg-green-50 px-3 text-sm text-green-700">
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    No active blockers.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {blockers.map(b => (
                      <Link key={b.id} href={`/projects/${b._projectId}`} className="block rounded-lg border border-red-100 bg-red-50 p-3 transition-colors hover:border-red-200">
                        <div className="font-medium text-red-800 text-sm">{b.name}</div>
                        <div className="text-xs text-red-500 mt-0.5">
                          {b._projectIdentifier} · {b._projectName}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base font-serif">My Tasks</CardTitle>
                <Link href="/my-tasks" className="inline-flex items-center gap-1 text-sm font-medium text-(--rs-primary-500) hover:text-(--rs-primary-700)">
                  View all <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </CardHeader>
              <CardContent>
                {!userId ? (
                  <p className="text-sm text-(--rs-neutral-grey-500) py-5 text-center">
                    Sign in to see your tasks.
                  </p>
                ) : myTasks.length === 0 ? (
                  <div className="flex min-h-24 items-center gap-2 rounded-lg border border-(--rs-neutral-grey-100) bg-(--rs-neutral-grey-50) px-3 text-sm text-(--rs-neutral-grey-500)">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
                    No active tasks assigned to you.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {myTasks.map(t => (
                      <Link
                        key={t.id}
                        href={`/projects/${t._projectId}`}
                        className="flex items-start justify-between rounded-md border border-transparent p-2.5 transition-colors hover:border-(--rs-neutral-grey-100) hover:bg-(--rs-neutral-grey-50)"
                      >
                        <div className="flex min-w-0 items-start gap-2.5">
                          <Circle className="mt-0.5 h-4 w-4 shrink-0 text-(--rs-neutral-grey-300)" aria-hidden="true" />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-(--rs-neutral-grey-900)">
                              {t.name}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                              <PriorityBadge priority={t.priority} />
                              <span className="text-(--rs-neutral-grey-400)">{t._projectName}</span>
                            </div>
                          </div>
                        </div>
                        <div className="ml-2 shrink-0 rounded bg-(--rs-neutral-grey-100) px-2 py-0.5 text-xs text-(--rs-neutral-grey-600)">
                          {t.state_detail?.name ?? 'No state'}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="flex items-center gap-2 text-base font-serif">
                  <CalendarDays className="h-4 w-4 text-(--rs-accent-500)" aria-hidden="true" /> Upcoming Deadlines
                </CardTitle>
                <Link href="/projects" className="inline-flex items-center gap-1 text-sm font-medium text-(--rs-primary-500) hover:text-(--rs-primary-700)">
                  View all <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </CardHeader>
              <CardContent>
                {deadlines.length === 0 ? (
                  <p className="rounded-lg border border-(--rs-neutral-grey-100) bg-(--rs-neutral-grey-50) px-3 py-5 text-sm text-(--rs-neutral-grey-500)">
                    No deadlines in the next 14 days.
                  </p>
                ) : (
                  <div className="space-y-3 pt-1">
                    {deadlines.map(t => {
                      const d = new Date(t.target_date!);
                      return (
                        <Link key={t.id} href={`/projects/${t._projectId}`} className="flex items-start gap-3 rounded-md p-1.5 transition-colors hover:bg-(--rs-neutral-grey-50)">
                          <div className="w-11 shrink-0 overflow-hidden rounded-md border border-(--rs-accent-200) bg-(--rs-accent-100) text-center text-(--rs-accent-800)">
                            <div className="bg-(--rs-accent-200) py-0.5 text-[9px] font-bold uppercase">
                              {d.toLocaleDateString('en-US', { month: 'short' })}
                            </div>
                            <div className="py-1 text-lg font-bold leading-none">{d.getDate()}</div>
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-(--rs-neutral-grey-900)">{t.name}</div>
                            <div className="mt-0.5 text-xs text-(--rs-neutral-grey-400)">
                              {t._projectIdentifier} · {t._projectName}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="flex items-center gap-2 text-base font-serif">
                  <Activity className="h-4 w-4 text-(--rs-primary-500)" aria-hidden="true" /> Recent Activity
                </CardTitle>
                <Link href="/projects" className="inline-flex items-center gap-1 text-sm font-medium text-(--rs-primary-500) hover:text-(--rs-primary-700)">
                  Projects <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </CardHeader>
              <CardContent>
                {activityError ? (
                  <p className="text-sm text-red-500">Could not load recent activity.</p>
                ) : recentActivity.length === 0 ? (
                  <p className="text-sm text-(--rs-neutral-grey-400) italic">No recent project activity.</p>
                ) : (
                  <div className="divide-y divide-(--rs-neutral-grey-100)">
                    {recentActivity.map(entry => (
                      <Link
                        key={entry.id}
                        href={`/projects/${entry.project_id}`}
                        className="flex items-start gap-3 rounded-md py-3 first:pt-0 last:pb-0 transition-colors hover:bg-(--rs-neutral-grey-50) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-300)"
                      >
                        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-(--rs-primary-50) text-(--rs-primary-600)">
                          <Activity className="w-4 h-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="text-xs font-semibold text-(--rs-neutral-grey-800)">
                              {entry.actor_name}
                            </span>
                            <span className="text-xs text-(--rs-neutral-grey-400)">
                              {formatActivityTime(entry.created_at)}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-sm leading-snug text-(--rs-neutral-grey-700)">
                            {describeDashboardActivity(entry)}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-(--rs-neutral-grey-400)">
                            {entry.project_identifier} · {entry.project_name}
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="project-health">
        <SectionHeading
          id="project-health"
          title="Project Health"
          description="Open work, completion progress, and blocked counts by project."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {projectStats.length === 0 && !loadError && (
            <p className="text-(--rs-neutral-grey-500) col-span-full text-sm italic">No projects found in workspace.</p>
          )}
          {projectStats.map(({ project, total, open, done, blocked }) => (
            <Link key={project.id} href={`/projects/${project.id}`} className="block h-full min-w-0">
              <Card className="h-full border-t-4 border-t-(--rs-primary-500) transition-colors hover:border-(--rs-primary-300)">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold uppercase text-(--rs-neutral-grey-400)">
                    {project.identifier}
                  </CardTitle>
                  <div className="text-base font-bold leading-tight text-(--rs-neutral-grey-900)">{project.name}</div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-3xl font-bold tabular-nums text-(--rs-neutral-grey-900)">{open}</span>
                      <span className="ml-1.5 text-xs text-(--rs-neutral-grey-400)">open</span>
                    </div>
                    <div className="space-y-1 text-right text-xs">
                      <div className="font-medium text-green-600">{done} done</div>
                      {blocked > 0 && (
                        <div className="inline-flex items-center gap-1 font-medium text-red-500">
                          <AlertCircle className="h-3 w-3" aria-hidden="true" /> {blocked} blocked
                        </div>
                      )}
                    </div>
                  </div>
                  {total > 0 && (
                    <>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-(--rs-neutral-grey-100)">
                        <div
                          className="h-full rounded-full bg-(--rs-primary-400) transition-all"
                          style={{ width: `${Math.round((done / total) * 100)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-right text-[10px] text-(--rs-neutral-grey-400)">
                        {Math.round((done / total) * 100)}% complete
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="team-capacity">
        <SectionHeading
          id="team-capacity"
          title="Team Capacity"
          description="Current open task distribution across workspace members."
          action={(
            <Link href="/weekly-report" className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-(--rs-primary-600) transition-colors hover:bg-(--rs-primary-50) hover:text-(--rs-primary-800)">
              Reports <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        />
        <Card>
          <CardContent>
            {workload.length === 0 ? (
              <p className="text-sm text-(--rs-neutral-grey-400) italic">No team data available.</p>
            ) : (
              <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
                {workload.map(({ member, count }) => (
                  <div key={member.id} className="flex items-center gap-3">
                    <div className="w-24 shrink-0 truncate text-sm font-medium text-(--rs-neutral-grey-600)">
                      {member.display_name.split(' ')[0]}
                    </div>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-(--rs-neutral-grey-100)">
                      <div
                        className={`h-full rounded-full transition-all ${
                          count / maxLoad > 0.8 ? 'bg-amber-400' : 'bg-(--rs-primary-400)'
                        }`}
                        style={{ width: `${(count / maxLoad) * 100}%` }}
                      />
                    </div>
                    <div className="w-6 shrink-0 text-right text-sm font-bold tabular-nums text-(--rs-neutral-grey-500)">
                      {count}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function TicketsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-3 w-12 mb-2" />
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2"><Skeleton className="h-5 w-32" /></CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
