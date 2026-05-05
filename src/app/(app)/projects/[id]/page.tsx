import { getProjects, getProjectStates, getWorkItems, buildStateLookup, enrichWorkItems } from '@/lib/plane';
import { notFound } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { KanbanBoard } from '@/components/kanban-board';

const EXCLUDED_GROUPS = new Set(['cancelled', 'canceled']);

export default async function ProjectBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let projectName = '';
  let states: Awaited<ReturnType<typeof getProjectStates>> = [];
  let items: Awaited<ReturnType<typeof getWorkItems>> = [];
  let planeError: string | null = null;

  try {
    const [projects, rawStates, rawItems] = await Promise.all([
      getProjects(),
      getProjectStates(id),
      getWorkItems(id),
    ]);

    const project = projects.find(p => p.id === id);
    if (!project) notFound();
    projectName = project.name;

    states = rawStates.filter(s => !EXCLUDED_GROUPS.has(s.group.toLowerCase()));
    const lookup = buildStateLookup(rawStates);
    items = enrichWorkItems(rawItems, lookup);
  } catch (err) {
    if ((err as { digest?: string })?.digest === 'NEXT_NOT_FOUND') throw err;
    planeError = err instanceof Error ? err.message : 'Failed to connect to Plane';
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">
          {projectName || 'Project Board'}
        </h1>
        <p className="text-(--rs-neutral-grey-500) text-sm mt-1">
          {items.length} work item{items.length !== 1 ? 's' : ''}
          {!planeError && ' · Drag cards to move between states · Click + to add a task'}
        </p>
      </div>

      {planeError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span><strong>Plane connection failed:</strong> {planeError}</span>
        </div>
      )}

      {!planeError && states.length === 0 && (
        <p className="text-(--rs-neutral-grey-500) italic text-sm">
          No states configured for this project in Plane.
        </p>
      )}

      {states.length > 0 && (
        <div className="overflow-x-auto pb-2">
          <KanbanBoard
            states={states}
            initialItems={items}
            projectId={id}
          />
        </div>
      )}
    </div>
  );
}
