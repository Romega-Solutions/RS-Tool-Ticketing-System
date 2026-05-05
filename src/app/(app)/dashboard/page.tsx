import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getProjects, getProjectStates, getWorkspaceMembers, getWorkItems, buildStateLookup, enrichWorkItems } from '@/lib/plane';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AlertCircle, Clock } from "lucide-react";
import Link from 'next/link';
import { normalizeRole, canAccessReports } from '@/lib/rbac';
import { PresencePanel } from '@/components/presence-panel';

async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload?.id) return null;
  const [user] = await db.select().from(users).where(eq(users.id, Number(payload.id)));
  return user ?? null;
}

function stateGroup(item: { state_detail?: { group?: string } }) {
  return (item.state_detail?.group ?? '').toLowerCase();
}

const PRIORITY_ICON: Record<string, string> = {
  urgent: '🔴', high: '🔴', medium: '🟡', low: '🟢', none: '⚪',
};

export default async function DashboardPage() {
  const sessionUser = await getSessionUser();
  const planeMemberId = sessionUser?.planeMemberId ?? null;
  const isFriday = new Date().getDay() === 5;
  const isLeadOrAdmin = canAccessReports(normalizeRole(sessionUser?.role));

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
    const done = items.filter(i => stateGroup(i) === 'completed').length;
    const blocked = items.filter(i =>
      i.label_detail?.some(l => l.name.toLowerCase().includes('blocker'))
    ).length;
    return { project: p, total: items.length, done, blocked };
  });

  const assignedToMe = (item: ItemMeta) =>
    planeMemberId &&
    (item.assignees?.includes(planeMemberId) || item.assignee_ids?.includes(planeMemberId));

  const myTasks = planeMemberId
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
          <strong>Plane connection failed:</strong> {planeError}.{' '}
          Check <code className="bg-red-100 px-1 rounded">PLANE_BASE_URL</code>,{' '}
          <code className="bg-red-100 px-1 rounded">PLANE_API_KEY</code>, and{' '}
          <code className="bg-red-100 px-1 rounded">PLANE_WORKSPACE_SLUG</code> in <code className="bg-red-100 px-1 rounded">.env</code>.
        </div>
      )}

      {/* Who's In — lead/admin only */}
      {isLeadOrAdmin && <PresencePanel />}

      {/* Project Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {projectStats.length === 0 && !planeError && (
          <p className="text-(--rs-neutral-grey-500) col-span-4 text-sm italic">No projects found in workspace.</p>
        )}
        {projectStats.map(({ project, total, done, blocked }) => (
          <Link key={project.id} href={`/projects/${project.id}`}>
            <Card className="hover:border-(--rs-primary-300) hover:shadow-md transition-all cursor-pointer border-t-4 border-t-(--rs-primary-500) h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold text-(--rs-neutral-grey-400) uppercase tracking-wide">{project.identifier}</CardTitle>
                <div className="text-base font-bold text-(--rs-neutral-grey-900) leading-tight">{project.name}</div>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between items-end">
                  <div className="text-3xl font-bold text-(--rs-neutral-grey-900) tabular-nums">{total}</div>
                  <div className="text-xs text-right space-y-0.5">
                    <div className="text-green-600 font-medium">{done} done</div>
                    {blocked > 0 && <div className="text-red-500 font-medium">{blocked} blocked</div>}
                  </div>
                </div>
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
            {!planeMemberId ? (
              <p className="text-sm text-(--rs-neutral-grey-400) italic">
                Plane account not linked. Ask your admin to set your Plane Member ID.
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
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-serif flex items-center gap-2">
              <Clock className="w-5 h-5 text-(--rs-accent-500)" /> Upcoming Deadlines
            </CardTitle>
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
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-serif">Team Workload</CardTitle>
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
                        className={`h-full rounded-full transition-all ${count / maxLoad > 0.8 ? 'bg-red-500' : 'bg-(--rs-primary-500)'}`}
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
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-serif flex items-center gap-2 text-red-600">
              <AlertCircle className="w-4 h-4" /> Active Blockers
            </CardTitle>
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
