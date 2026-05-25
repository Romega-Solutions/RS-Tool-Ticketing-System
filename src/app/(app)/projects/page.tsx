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
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">Projects</h1>
          <p className="text-(--rs-neutral-grey-500) text-sm mt-1">
            {effectiveTeam
              ? `Showing ${effectiveTeam} team projects.`
              : 'All active projects in the Romega Solutions workspace.'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {showToggle && (
            <div className="inline-flex border border-(--rs-neutral-grey-200) rounded-md overflow-hidden text-xs">
              <Link
                href="/projects"
                className={`px-3 py-1.5 ${onMyTeam ? 'bg-(--rs-primary-500) text-white' : 'bg-white text-(--rs-neutral-grey-600) hover:bg-(--rs-neutral-grey-50)'}`}
              >
                My team ({session!.team})
              </Link>
              <Link
                href="/projects?team=all"
                className={`px-3 py-1.5 border-l border-(--rs-neutral-grey-200) ${!onMyTeam ? 'bg-(--rs-primary-500) text-white' : 'bg-white text-(--rs-neutral-grey-600) hover:bg-(--rs-neutral-grey-50)'}`}
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map(p => {
          const s = stats[p.id] ?? { total: 0, open: 0, done: 0 };
          const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
          return (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="hover:border-(--rs-primary-300) transition-colors cursor-pointer border-t-4 border-t-(--rs-primary-500) h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded bg-(--rs-primary-100) text-(--rs-primary-700) text-xs font-bold shrink-0">
                      {p.identifier}
                    </span>
                    <CardTitle className="text-base font-bold text-(--rs-neutral-grey-900) leading-tight">
                      {p.name}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {p.description && (
                    <p className="text-xs text-(--rs-neutral-grey-500) line-clamp-2">{p.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-sm">
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
