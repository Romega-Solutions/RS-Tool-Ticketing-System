import { getProjects, getProjectStates, getWorkItems, getCycles, buildStateLookup, enrichWorkItems } from '@/lib/tickets';
import { getSession } from '@/lib/session';
import { canManageProject } from '@/lib/permissions';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, Settings } from 'lucide-react';
import { KanbanBoard } from '@/components/kanban-board';

const EXCLUDED_GROUPS = new Set(['cancelled', 'canceled']);

export default async function ProjectBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect('/login');

  let projectName = '';
  let states: Awaited<ReturnType<typeof getProjectStates>> = [];
  let items: Awaited<ReturnType<typeof getWorkItems>> = [];
  let cycles: Awaited<ReturnType<typeof getCycles>> = [];
  let loadError: string | null = null;

  try {
    const [projects, rawStates, rawItems, cycleRows] = await Promise.all([
      getProjects(),
      getProjectStates(id),
      getWorkItems(id),
      getCycles(id),
    ]);

    const project = projects.find(p => p.id === id);
    if (!project) notFound();
    projectName = project.name;

    states = rawStates.filter(s => !EXCLUDED_GROUPS.has(s.group.toLowerCase()));
    const lookup = buildStateLookup(rawStates);
    items = enrichWorkItems(rawItems, lookup);
    cycles = cycleRows;
  } catch (err) {
    if ((err as { digest?: string })?.digest === 'NEXT_NOT_FOUND') throw err;
    loadError = err instanceof Error ? err.message : 'Failed to load board';
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">
            {projectName || 'Project Board'}
          </h1>
          <p className="text-(--rs-neutral-grey-500) text-sm mt-1">
            {items.length} work item{items.length !== 1 ? 's' : ''}
            {!loadError && ' · Drag cards to move between states · Click + to add a task'}
          </p>
        </div>
        {canManageProject(session) && (
          <Link
            href={`/projects/${id}/settings`}
            className="flex items-center gap-1.5 text-sm text-(--rs-neutral-grey-600) hover:text-(--rs-primary-700) px-3 py-1.5 rounded-md border border-(--rs-neutral-grey-200) hover:border-(--rs-primary-300) bg-white"
          >
            <Settings className="w-3.5 h-3.5" /> Settings
          </Link>
        )}
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span><strong>Couldn&apos;t load this board.</strong> {loadError}</span>
        </div>
      )}

      {!loadError && states.length === 0 && (
        <p className="text-(--rs-neutral-grey-500) italic text-sm">
          No workflow states configured for this project.
        </p>
      )}

      {states.length > 0 && (
        <div className="overflow-x-auto pb-2">
          <KanbanBoard
            states={states}
            initialItems={items}
            projectId={id}
            currentUserId={session.id}
            isAdmin={session.role === 'admin'}
            cycles={cycles}
          />
        </div>
      )}
    </div>
  );
}
