import { getSession } from '@/lib/session';
import { getProjects, getProjectStates, getWorkItems, buildStateLookup, enrichWorkItems, PlaneWorkItem, PlaneState } from '@/lib/tickets';
import { Card, CardContent } from "@/components/ui/card";
import { TaskCard } from '@/components/task-card';

export type TaskWithProject = PlaneWorkItem & {
  _projectName: string;
  _projectIdentifier: string;
  _projectId: string;
  _completedStateId: string;
  _startedStateId: string;
};

function getStateId(states: PlaneState[], group: string): string {
  return states.find(s => s.group.toLowerCase() === group)?.id ?? '';
}

const ACTIVE_GROUPS  = new Set(['started', 'in_progress', 'inprogress', 'in progress', 'unstarted']);
const BACKLOG_GROUPS = new Set(['backlog', 'todo']);

export default async function MyTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = 'active' } = await searchParams;
  const sessionUser = await getSession();
  const planeMemberId = sessionUser?.planeMemberId ?? null;

  let activeTasks:    TaskWithProject[] = [];
  let backlogTasks:   TaskWithProject[] = [];
  let completedTasks: TaskWithProject[] = [];
  let planeError: string | null = null;

  if (planeMemberId) {
    try {
      const projects = await getProjects();
      const byProject = await Promise.all(
        projects.map(async p => {
          const [items, states] = await Promise.all([
            getWorkItems(p.id, { assignee: planeMemberId }),
            getProjectStates(p.id),
          ]);
          const lookup = buildStateLookup(states);
          const completedStateId = getStateId(states, 'completed');
          const startedStateId   = getStateId(states, 'started') || getStateId(states, 'in_progress');
          return enrichWorkItems(items, lookup).map(i => ({
            ...i,
            _projectName:       p.name,
            _projectIdentifier: p.identifier,
            _projectId:         p.id,
            _completedStateId:  completedStateId,
            _startedStateId:    startedStateId,
          }));
        })
      );

      const all = byProject.flat();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      activeTasks    = all.filter(i => ACTIVE_GROUPS.has((i.state_detail?.group ?? '').toLowerCase()));
      backlogTasks   = all.filter(i => BACKLOG_GROUPS.has((i.state_detail?.group ?? '').toLowerCase()));
      completedTasks = all.filter(i => {
        if ((i.state_detail?.group ?? '').toLowerCase() !== 'completed') return false;
        if (!i.completed_at) return true;
        return new Date(i.completed_at) >= thirtyDaysAgo;
      });
    } catch (err) {
      planeError = err instanceof Error ? err.message : 'Failed to connect to Plane';
    }
  }

  const tabs = [
    { key: 'active',    label: 'Active',    count: activeTasks.length },
    { key: 'backlog',   label: 'Backlog',   count: backlogTasks.length },
    { key: 'completed', label: 'Completed', count: completedTasks.length },
  ];

  const currentTasks =
    tab === 'completed' ? completedTasks
    : tab === 'backlog' ? backlogTasks
    : activeTasks;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">My Tasks</h1>
        <p className="text-(--rs-neutral-grey-500) text-sm mt-1">
          All tasks assigned to you across every project.
        </p>
      </div>

      {!planeMemberId && (
        <div className="bg-(--rs-primary-50) border border-(--rs-primary-200) text-(--rs-primary-800) px-4 py-3 rounded-lg text-sm">
          Your member profile isn&apos;t linked yet. Ask an admin to link it in your{' '}
          <a href="/profile" className="underline font-medium">profile</a>.
        </div>
      )}

      {planeError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          Couldn&apos;t load your tasks. Refresh; if it persists, contact an admin.
        </div>
      )}

      {planeMemberId && !planeError && (
        <>
          {/* Tab bar */}
          <div className="flex gap-0.5 border-b border-(--rs-neutral-grey-200) overflow-x-auto">
            {tabs.map(t => (
              <a
                key={t.key}
                href={`?tab=${t.key}`}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                  tab === t.key
                    ? 'border-(--rs-primary-500) text-(--rs-primary-600)'
                    : 'border-transparent text-(--rs-neutral-grey-500) hover:text-(--rs-neutral-grey-700) hover:border-(--rs-neutral-grey-300)'
                }`}
              >
                {t.label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                    tab === t.key
                      ? 'bg-(--rs-primary-100) text-(--rs-primary-700)'
                      : 'bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-500)'
                  }`}
                >
                  {t.count}
                </span>
              </a>
            ))}
          </div>

          <Card>
            <CardContent className="p-4">
              {currentTasks.length === 0 ? (
                <p className="text-(--rs-neutral-grey-400) italic text-sm text-center py-10">
                  {tab === 'active'
                    ? "No active tasks — you're all clear!"
                    : tab === 'backlog'
                    ? 'No backlog tasks.'
                    : 'No tasks completed in the last 30 days.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {currentTasks.map(task => (
                    <TaskCard key={task.id} task={task} currentTab={tab} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
