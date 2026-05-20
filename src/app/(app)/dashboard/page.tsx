import { getSession } from '@/lib/session';
import { getProjects, getProjectStates, getWorkspaceMembers, getWorkItems, buildStateLookup, enrichWorkItems } from '@/lib/tickets';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AlertCircle, Clock, Users, FileText } from "lucide-react";
import Link from 'next/link';
import { HoursChart } from '@/components/hours-chart';
import { FxRateWidget } from '@/components/fx-rate-widget';

function stateGroup(item: { state_detail?: { group?: string } }) {
  return (item.state_detail?.group ?? '').toLowerCase();
}

const PRIORITY_ICON: Record<string, string> = {
  urgent: '🔴', high: '🔴', medium: '🟡', low: '🟢', none: '⚪',
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

export default async function DashboardPage() {
  const sessionUser = await getSession();
  // "My tasks" matches against either the user's id (assignee_ids) or email
  // (assignees) — getWorkItems populates both.
  const myUserId = sessionUser ? String(sessionUser.id) : null;
  const myEmail  = sessionUser?.email ?? null;
  const isFriday = new Date().getDay() === 5;

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

  let projects: Awaited<ReturnType<typeof getProjects>> = [];
  let members: Awaited<ReturnType<typeof getWorkspaceMembers>> = [];
  let allItems: ItemMeta[] = [];
  let planeError: string | null = null;

  try {
    [projects, members] = await Promise.all([getProjects(), getWorkspaceMembers()]);
    const byProject = await Promise.all(
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
      })
    );
    allItems = byProject.flat();
  } catch (err) {
    planeError = err instanceof Error ? err.message : 'Failed to connect to Plane';
  }

  const openGroups = new Set(['backlog', 'unstarted', 'started', 'in_progress', 'inprogress', 'todo', 'in progress']);

  const projectStats = projects.map(p => {
    const items = allItems.filter(i => i._projectId === p.id);
    const open = items.filter(i => openGroups.has(stateGroup(i))).length;
    const done = items.filter(i => stateGroup(i) === 'completed').length;
    const blocked = items.filter(i =>
      i.label_detail?.some(l => l.name.toLowerCase().includes('blocker'))
    ).length;
    return { project: p, total: items.length, open, done, blocked };
  });

  const assignedToMe = (item: ItemMeta) =>
    !!sessionUser &&
    ((myUserId !== null && item.assignee_ids?.includes(myUserId)) ||
     (myEmail  !== null && item.assignees?.includes(myEmail)));

  const myTasks = sessionUser
    ? allItems.filter(i => openGroups.has(stateGroup(i)) && assignedToMe(i)).slice(0, 3)
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
        openGroups.has(stateGroup(i)) &&
        (i.assignees?.includes(m.id) || i.assignee_ids?.includes(m.id))
      ).length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const maxLoad = Math.max(...workload.map(w => w.count), 1);

  const blockers = allItems
    .filter(i =>
      openGroups.has(stateGroup(i)) &&
      i.label_detail?.some(l => l.name.toLowerCase().includes('blocker'))
    )
    .slice(0, 4);

  // Summary widgets — best-effort, don't break the page if DB is slow
  let attendanceToday = { present: 0, total: 0 };
  let reportsSummary = { submitted: 0, total: 0 };
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
      submitted: ((reportsRes.data ?? []) as { submitted_at: string | null }[])
        .filter(r => r.submitted_at).length,
      total,
    };
  } catch { /* best-effort */ }

  // Hours chart data — best-effort
  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  let weeklyData:  { day: string;  hours: number }[] = DAY_NAMES.map(d => ({ day: d, hours: 0 }));
  let monthlyData: { week: string; hours: number }[] = Array.from({ length: 4 }, (_, i) => ({ week: `Wk ${i + 1}`, hours: 0 }));
  let totalWeekHours  = 0;
  let totalMonthHours = 0;

  try {
    if (sessionUser) {
      const admin    = createAdminClient();
      const today    = new Date().toISOString().split('T')[0];
      const monthAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const { data: tsRows } = await admin
        .from('timesheets')
        .select('date, duration_seconds')
        .eq('user_id', sessionUser.id)
        .gte('date', monthAgo)
        .lte('date', today)
        .not('duration_seconds', 'is', null);

      const rows = (tsRows ?? []) as { date: string; duration_seconds: number }[];

      // Weekly: map each Mon–Sun date
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

      // Monthly: last 4 Mon-based weeks
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
    }
  } catch { /* best-effort */ }

  return (
    <div className="space-y-6">
      {isFriday && (
        <div className="bg-(--rs-accent-100) border border-(--rs-accent-300) text-(--rs-accent-800) px-4 py-3 rounded-lg flex items-center gap-3 font-medium text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Weekly report due today at 11:59 PM — don&apos;t forget to submit.
        </div>
      )}

      {planeError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          Could not load project data. Try refreshing; if it persists, contact an admin.
        </div>
      )}

      <FxRateWidget />

      {/* Quick Summary Row */}
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

        <Link href="/reports">
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

      {/* My Hours Chart */}
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

      {/* Project Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {projectStats.length === 0 && !planeError && (
          <p className="text-(--rs-neutral-grey-500) col-span-4 text-sm italic">No projects found in workspace.</p>
        )}
        {projectStats.map(({ project, total, open, done, blocked }) => (
          <Link key={project.id} href={`/projects/${project.id}`}>
            <Card className="hover:border-(--rs-primary-300) hover:shadow-md transition-all cursor-pointer border-t-4 border-t-(--rs-primary-500) h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold text-(--rs-neutral-grey-400) uppercase tracking-wide">
                  {project.identifier}
                </CardTitle>
                <div className="text-base font-bold text-(--rs-neutral-grey-900) leading-tight">{project.name}</div>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-baseline">
                  <div>
                    <span className="text-3xl font-bold tabular-nums text-(--rs-neutral-grey-900)">{open}</span>
                    <span className="text-xs text-(--rs-neutral-grey-400) ml-1.5">open tasks</span>
                  </div>
                  <div className="text-xs text-right space-y-0.5">
                    <div className="text-green-600 font-medium">{done} done</div>
                    {blocked > 0 && <div className="text-red-500 font-medium">{blocked} blocked</div>}
                  </div>
                </div>
                {total > 0 && (
                  <>
                    <div className="mt-2.5 h-1.5 bg-(--rs-neutral-grey-100) rounded-full overflow-hidden">
                      <div
                        className="h-full bg-(--rs-primary-400) rounded-full transition-all"
                        style={{ width: `${Math.round((done / total) * 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-(--rs-neutral-grey-400) mt-1 text-right">
                      {Math.round((done / total) * 100)}% complete
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* My Tasks + Deadlines */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-t-4 border-t-(--rs-accent-500)">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-serif">My Tasks</CardTitle>
            <Link href="/my-tasks" className="text-sm text-(--rs-primary-500) hover:text-(--rs-primary-700) font-medium transition-colors">
              View all →
            </Link>
          </CardHeader>
          <CardContent>
            {!sessionUser ? (
              <p className="text-sm text-(--rs-neutral-grey-500) py-5 text-center">
                Sign in to see your tasks.
              </p>
            ) : myTasks.length === 0 ? (
              <p className="text-sm text-(--rs-neutral-grey-400) italic">No active tasks.</p>
            ) : (
              <div className="space-y-2">
                {myTasks.map(t => (
                  <div
                    key={t.id}
                    className="flex items-start justify-between p-2.5 hover:bg-(--rs-neutral-grey-50) rounded-md border border-transparent hover:border-(--rs-neutral-grey-100) transition-colors"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="mt-0.5 w-4 h-4 rounded border border-(--rs-neutral-grey-300) bg-white shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-(--rs-neutral-grey-900) truncate">
                          {PRIORITY_ICON[t.priority] ?? '⚪'} {t.name}
                        </div>
                        <div className="text-xs text-(--rs-neutral-grey-400) mt-0.5">
                          {t._projectName}
                          {t.target_date
                            ? ` · ${new Date(t.target_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                            : ''}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-600) px-2 py-0.5 rounded shrink-0 ml-2">
                      {t.state_detail?.name ?? '—'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-serif flex items-center gap-2">
              <Clock className="w-5 h-5 text-(--rs-accent-500)" /> Upcoming Deadlines
            </CardTitle>
            <Link href="/projects" className="text-sm text-(--rs-primary-500) hover:text-(--rs-primary-700) font-medium transition-colors">
              View all →
            </Link>
          </CardHeader>
          <CardContent>
            {deadlines.length === 0 ? (
              <p className="text-sm text-(--rs-neutral-grey-400) italic pt-2">No deadlines in the next 14 days.</p>
            ) : (
              <div className="space-y-4 pt-1">
                {deadlines.map(t => {
                  const d = new Date(t.target_date!);
                  return (
                    <div key={t.id} className="flex gap-3 items-start">
                      <div className="bg-(--rs-accent-100) text-(--rs-accent-800) w-11 text-center rounded-md overflow-hidden shrink-0 border border-(--rs-accent-200)">
                        <div className="text-[9px] font-bold uppercase bg-(--rs-accent-200) py-0.5 tracking-wide">
                          {d.toLocaleDateString('en-US', { month: 'short' })}
                        </div>
                        <div className="text-lg font-bold py-1 leading-none">{d.getDate()}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-(--rs-neutral-grey-900) text-sm truncate">{t.name}</div>
                        <div className="text-xs text-(--rs-neutral-grey-400) mt-0.5">
                          {t._projectIdentifier} · {t._projectName}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Workload + Blockers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-serif">Team Workload</CardTitle>
            <Link href="/reports" className="text-sm text-(--rs-primary-500) hover:text-(--rs-primary-700) font-medium transition-colors">
              View reports →
            </Link>
          </CardHeader>
          <CardContent>
            {workload.length === 0 ? (
              <p className="text-sm text-(--rs-neutral-grey-400) italic pt-2">No team data available.</p>
            ) : (
              <div className="space-y-3.5 pt-1">
                {workload.map(({ member, count }) => (
                  <div key={member.id} className="flex items-center gap-3">
                    <div className="w-20 text-sm font-medium text-right text-(--rs-neutral-grey-600) truncate shrink-0">
                      {member.display_name.split(' ')[0]}
                    </div>
                    <div className="flex-1 h-2 bg-(--rs-neutral-grey-100) rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          count / maxLoad > 0.8 ? 'bg-amber-400' : 'bg-(--rs-primary-400)'
                        }`}
                        style={{ width: `${(count / maxLoad) * 100}%` }}
                      />
                    </div>
                    <div className="w-5 text-sm text-(--rs-neutral-grey-500) font-bold tabular-nums text-right shrink-0">
                      {count}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-red-400">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-serif flex items-center gap-2 text-red-600">
              <AlertCircle className="w-4 h-4" /> Active Blockers
            </CardTitle>
            <Link href="/projects" className="text-sm text-(--rs-primary-500) hover:text-(--rs-primary-700) font-medium transition-colors">
              View projects →
            </Link>
          </CardHeader>
          <CardContent>
            {blockers.length === 0 ? (
              <p className="text-sm text-(--rs-neutral-grey-400) italic pt-2">No active blockers. 🎉</p>
            ) : (
              <div className="space-y-2.5">
                {blockers.map(b => (
                  <div key={b.id} className="p-3 bg-red-50 border border-red-100 rounded-lg">
                    <div className="font-medium text-red-800 text-sm">{b.name}</div>
                    <div className="text-xs text-red-500 mt-0.5">
                      {b._projectIdentifier} · {b._projectName}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
