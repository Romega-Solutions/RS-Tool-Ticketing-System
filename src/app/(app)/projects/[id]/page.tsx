import { getProjects, getProjectStates, getWorkItems, getCycles, buildStateLookup, enrichWorkItems } from '@/lib/tickets';
import { getSession } from '@/lib/session';
import { getProjectCaps } from '@/lib/permissions';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, MessageSquare, Settings } from 'lucide-react';
import { KanbanBoard } from '@/components/kanban-board';
import { BoardSearch } from '@/components/board-search';

const EXCLUDED_GROUPS = new Set(['cancelled', 'canceled']);

// Fields on a work item that the search box looks at. Keep the ones that exist
// on your enriched work item type (e.g. drop 'title' if you only have 'name').
const SEARCH_FIELDS = ['name', 'title', 'description_stripped'] as const;

function matchesQuery(item: object, query: string) {
  const record = item as Record<string, unknown>;
  return SEARCH_FIELDS.some(field => {
    const value = record[field];
    return typeof value === 'string' && value.toLowerCase().includes(query);
  });
}

export default async function ProjectBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { id } = await params;
  const { q } = await searchParams;
  const rawQuery = Array.isArray(q) ? q[0] : q;
  const query = (rawQuery ?? '').trim().toLowerCase();

  const session = await getSession();
  if (!session) redirect('/login');   // Projects is a Workspace tool — open to all

  // Per-project access: members/leads (+ admins) only; non-members are bounced.
  const caps = await getProjectCaps(session, Number(id));
  if (!caps.canView) redirect('/projects');

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

  // Filtering here means every state column only receives matching cards.
  const visibleItems = query ? items.filter(item => matchesQuery(item, query)) : items;

  return (
    <div className="space-y-5 overflow-x-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">
            {projectName || 'Project Board'}
          </h1>
          <p className="text-(--rs-neutral-grey-500) text-sm mt-1 max-w-2xl">
            {query
              ? `${visibleItems.length} of ${items.length} work item${items.length !== 1 ? 's' : ''} match`
              : `${items.length} work item${items.length !== 1 ? 's' : ''}`}
            {!loadError && ' · Scroll sideways to review states · Drag cards to move them'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/projects/${id}/discussion`}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-(--rs-neutral-grey-200) bg-white px-3 py-2 text-sm text-(--rs-neutral-grey-600) transition-colors hover:border-(--rs-primary-300) hover:text-(--rs-primary-700)"
          >
            <MessageSquare className="w-3.5 h-3.5" /> Discussion
          </Link>
          {caps.canManage && (
            <Link
              href={`/projects/${id}/settings`}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-(--rs-neutral-grey-200) bg-white px-3 py-2 text-sm text-(--rs-neutral-grey-600) transition-colors hover:border-(--rs-primary-300) hover:text-(--rs-primary-700)"
            >
              <Settings className="w-3.5 h-3.5" /> Settings
            </Link>
          )}
        </div>
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
        <BoardSearch />
      )}

      {states.length > 0 && query && visibleItems.length === 0 && (
        <p className="text-(--rs-neutral-grey-500) text-sm">
          No tasks match &ldquo;{rawQuery?.trim()}&rdquo;. Try a different word or clear the search.
        </p>
      )}

      {states.length > 0 && (
        <div className="max-w-full overflow-hidden">
          {/* key resets the board's internal card state whenever the search changes */}
          <KanbanBoard
            key={query}
            states={states}
            initialItems={visibleItems}
            projectId={id}
            currentUserId={session.id}
            isAdmin={session.role === 'admin'}
            caps={caps}
            cycles={cycles}
          />
        </div>
      )}
    </div>
  );
}