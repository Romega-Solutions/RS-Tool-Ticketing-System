import Link from 'next/link';
import { getProjects, getProjectStates, getWorkItems, buildStateLookup, enrichWorkItems } from '@/lib/tickets';
import { getSession } from '@/lib/session';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Briefcase } from 'lucide-react';
import { NewProjectButton } from '@/components/new-project-button';

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const session = await getSession();
  const { team: teamParam } = await searchParams;

  // Default-filter: leads with a team set see only their team's projects unless
  // they pass ?team=all (or some other explicit value). Admins/CEO/IC are
  // never auto-filtered.
  const shouldDefaultToMyTeam =
    session?.role === 'lead' && session.team && teamParam === undefined;
  const effectiveTeam =
    teamParam === 'all' ? null
    : teamParam ? teamParam
    : shouldDefaultToMyTeam ? session!.team
    : null;

  const showToggle = session?.role === 'lead' && !!session.team;
  const onMyTeam = effectiveTeam !== null && effectiveTeam === session?.team;

  let projects: Awaited<ReturnType<typeof getProjects>> = [];
  let stats: Record<string, { total: number; open: number; done: number }> = {};
  let loadError: string | null = null;

  try {
    projects = await getProjects({ team: effectiveTeam });
    const results = await Promise.all(
      projects.map(async p => {
        const [items, states] = await Promise.all([
          getWorkItems(p.id),
          getProjectStates(p.id),
        ]);
        const lookup = buildStateLookup(states);
        const enriched = enrichWorkItems(items, lookup);
        const total = enriched.length;
        const done = enriched.filter(i =>
          (i.state_detail?.group ?? '').toLowerCase() === 'completed'
        ).length;
        return { id: p.id, total, open: total - done, done };
      })
    );
    stats = Object.fromEntries(results.map(r => [r.id, r]));
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Failed to load projects';
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">Projects</h1>
          <p className="text-(--rs-neutral-grey-500) text-sm mt-1 max-w-2xl">
            {effectiveTeam
              ? `Showing ${effectiveTeam} team projects.`
              : 'All active projects in the Romega Solutions workspace.'}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end sm:flex-wrap">
          {showToggle && (
            <div className="grid grid-cols-2 overflow-hidden rounded-md border border-(--rs-neutral-grey-200) text-xs sm:inline-flex">
              <Link
                href="/projects"
                className={`flex min-h-10 items-center justify-center px-3 py-2 text-center transition-colors ${onMyTeam ? 'bg-(--rs-primary-500) text-white' : 'bg-white text-(--rs-neutral-grey-600) hover:bg-(--rs-neutral-grey-50)'}`}
              >
                My team ({session!.team})
              </Link>
              <Link
                href="/projects?team=all"
                className={`flex min-h-10 items-center justify-center border-l border-(--rs-neutral-grey-200) px-3 py-2 text-center transition-colors ${!onMyTeam ? 'bg-(--rs-primary-500) text-white' : 'bg-white text-(--rs-neutral-grey-600) hover:bg-(--rs-neutral-grey-50)'}`}
              >
                All teams
              </Link>
            </div>
          )}
          {session && (
            <NewProjectButton
              defaultTeam={session.team}
              canChooseTeam={session.role === 'admin' || session.role === 'lead'}
            />
          )}
        </div>
      </div>

      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
          Couldn&apos;t load projects. Refresh; if it persists, contact an admin.
        </div>
      )}

      {projects.length === 0 && !loadError && (
        <p className="text-(--rs-neutral-grey-500) italic text-sm">No projects found in workspace.</p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map(p => {
          const s = stats[p.id] ?? { total: 0, open: 0, done: 0 };
          const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
          return (
            <Link key={p.id} href={`/projects/${p.id}`} className="block h-full min-w-0">
              <Card className="h-full cursor-pointer border-t-4 border-t-(--rs-primary-500) transition-colors hover:border-(--rs-primary-300)">
                <CardHeader className="pb-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded bg-(--rs-primary-100) text-xs font-bold text-(--rs-primary-700)">
                      {p.identifier}
                    </span>
                    <CardTitle className="min-w-0 text-base font-bold leading-tight text-(--rs-neutral-grey-900)">
                      {p.name}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {p.description && (
                    <p className="text-xs text-(--rs-neutral-grey-500) line-clamp-2">{p.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="text-(--rs-neutral-grey-500)">
                      <span className="font-semibold text-(--rs-neutral-grey-900)">{s.total}</span> tasks
                    </span>
                    <span className="text-green-600 font-medium">{s.done} done</span>
                    <span className="text-(--rs-neutral-grey-500)">{s.open} open</span>
                  </div>
                  {s.total > 0 && (
                    <div>
                      <div className="h-1.5 bg-(--rs-neutral-grey-100) rounded-full overflow-hidden">
                        <div
                          className="h-full bg-(--rs-primary-500) rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-xs text-(--rs-neutral-grey-400) mt-1 text-right">{pct}% complete</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {projects.length === 0 && loadError && (
        <div className="flex flex-col items-center justify-center py-16 text-(--rs-neutral-grey-400)">
          <Briefcase className="w-12 h-12 mb-4 opacity-30" />
          <p className="text-sm">No projects yet.</p>
        </div>
      )}
    </div>
  );
}
