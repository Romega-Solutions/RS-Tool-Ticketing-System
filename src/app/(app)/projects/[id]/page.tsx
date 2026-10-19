import { getProjects, getProjectStates, getWorkItems, getCycles, buildStateLookup, enrichWorkItems } from '@/lib/tickets';
import { getSession } from '@/lib/session';
import { getProjectCaps, canEditProjectColumns } from '@/lib/permissions';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import { projectPath } from '@/lib/project-slug';
import { resolveProjectParam } from '@/lib/project-slug-server';
import Link from 'next/link';
import { AlertCircle, MessageSquare, Settings } from 'lucide-react';
import { KanbanBoard } from '@/components/kanban-board';

const EXCLUDED_GROUPS = new Set(['cancelled', 'canceled']);

export default async function ProjectBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: rawId } = await params;
  const session = await getSession();
  if (!session) redirect('/login');   // Projects is a Workspace tool — open to all

  // The URL key is a slug or a numeric id. An unknown key resolves to id 0 (no
  // such project), so it behaves exactly like a missing numeric id: non-members
  // are bounced to /projects and admins get a 404.
  const resolved = await resolveProjectParam(rawId);
  const id = String(resolved?.id ?? 0);

  // Per-project access: members/leads (+ admins) only; non-members are bounced.
  const caps = await getProjectCaps(session, Number(id));
  if (!caps.canView) redirect('/projects');

  // Old numeric links → canonical slug URL (308), keeping ?task=&comment=.
  if (resolved?.slug && rawId !== resolved.slug) {
    permanentRedirect(projectPath(resolved, '', await searchParams));
  }
  const projectRef = { id, slug: resolved?.slug ?? null };
  const showSettings = caps.canManage || await canEditProjectColumns(session, Number(id));

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
    <div className="space-y-5 overflow-x-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">
            {projectName || 'Project Board'}
          </h1>
          <p className="text-(--rs-neutral-grey-500) text-sm mt-1 max-w-2xl">
            {items.length} work item{items.length !== 1 ? 's' : ''}
            {!loadError && ' · Scroll sideways to review states · Drag cards to move them'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={projectPath(projectRef, 'discussion')}
            className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-(--rs-neutral-grey-200) bg-white px-3 py-2 text-sm text-(--rs-neutral-grey-600) transition-colors hover:border-(--rs-primary-300) hover:text-(--rs-primary-700)"
          >
            <MessageSquare className="w-3.5 h-3.5" /> Discussion
          </Link>
          {showSettings && (
            <Link
              href={projectPath(projectRef, 'settings')}
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
        <div className="max-w-full overflow-hidden">
          <KanbanBoard
            states={states}
            initialItems={items}
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
