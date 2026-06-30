import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  getProjects,
  getProjectStates,
  getWorkItems,
  getProjectActivity,
  buildStateLookup,
  enrichWorkItems,
} from '@/lib/tickets';
import { getSession } from '@/lib/session';
import { canArchiveProject } from '@/lib/permissions';
import { Briefcase } from 'lucide-react';
import { NewProjectButton } from '@/components/new-project-button';
import { ProjectCard } from '@/components/project-card.client';
import { ProjectActivityFeed } from '@/components/project-activity-feed';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'active', label: 'Active' },
  { key: 'archived', label: 'Archived' },
  { key: 'activity', label: 'Project Activity' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

type CardMeta = { stat: { total: number; open: number; done: number }; canArchive: boolean };

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; tab?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');   // Projects is a Workspace tool — open to all
  const { team: teamParam, tab: tabParam } = await searchParams;

  const tab: TabKey =
    tabParam === 'archived' ? 'archived' : tabParam === 'activity' ? 'activity' : 'active';

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
  const privileged = session.role === 'admin' || session.role === 'lead';

  // Preserve the active team scope when moving between tabs.
  const tabHref = (key: TabKey) => {
    const sp = new URLSearchParams();
    if (key !== 'active') sp.set('tab', key);
    if (teamParam) sp.set('team', teamParam);
    const qs = sp.toString();
    return qs ? `/projects?${qs}` : '/projects';
  };

  let projects: Awaited<ReturnType<typeof getProjects>> = [];
  let meta: Record<string, CardMeta> = {};
  let activity: Awaited<ReturnType<typeof getProjectActivity>> = [];
  let loadError: string | null = null;

  try {
    if (tab === 'activity') {
      activity = await getProjectActivity({ team: effectiveTeam });
    } else {
      projects = await getProjects({ team: effectiveTeam, archived: tab === 'archived' ? 1 : 0 });
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
          // Visibility of the kebab = real archive permission. Only resolve the
          // per-project check for leads/admins; everyone else gets no kebab.
          const canArchive = privileged ? await canArchiveProject(session, Number(p.id)) : false;
          return { id: p.id, stat: { total, open: total - done, done }, canArchive };
        })
      );
      meta = Object.fromEntries(results.map(r => [r.id, { stat: r.stat, canArchive: r.canArchive }]));
    }
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Failed to load projects';
  }

  const description =
    tab === 'archived'
      ? 'Archived projects. Restore any to move it back to Active.'
      : tab === 'activity'
      ? 'Created and archived project events, newest first.'
      : effectiveTeam
      ? `Showing ${effectiveTeam} team projects.`
      : 'All active projects in the Romega Solutions workspace.';

  const currentTabLabel = TABS.find(t => t.key === tab)!.label;

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">Projects</h1>
          <p className="text-(--rs-neutral-grey-500) text-sm mt-1 max-w-2xl">{description}</p>
        </div>
        {session && (
          <div className="flex w-full sm:w-auto sm:justify-end">
            <NewProjectButton
              defaultTeam={session.team}
              canChooseTeam={session.role === 'admin' || session.role === 'lead'}
            />
          </div>
        )}
      </div>

      {/* Tabs: Active · Archived · Project Activity */}
      <div role="tablist" aria-label="Project views" className="flex flex-wrap gap-x-6 border-b border-(--rs-neutral-grey-200)">
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <Link
              key={t.key}
              role="tab"
              aria-selected={active}
              href={tabHref(t.key)}
              className={cn(
                '-mb-px inline-flex items-center border-b-2 px-1 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-300)',
                active
                  ? 'border-(--rs-primary-500) text-(--rs-primary-700)'
                  : 'border-transparent text-(--rs-neutral-grey-500) hover:border-(--rs-neutral-grey-300) hover:text-(--rs-neutral-grey-800)',
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Team toggle lives under the Active tab only. */}
      {tab === 'active' && showToggle && (
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

      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
          Couldn&apos;t load projects. Refresh; if it persists, contact an admin.
        </div>
      )}

      <div role="tabpanel" aria-label={currentTabLabel} className="space-y-6">
        {tab === 'activity' ? (
          !loadError && <ProjectActivityFeed entries={activity} />
        ) : (
          <>
            {projects.length === 0 && !loadError && (
              <div className="flex flex-col items-center justify-center py-16 text-(--rs-neutral-grey-400)">
                <Briefcase className="mb-4 h-12 w-12 opacity-30" aria-hidden="true" />
                <p className="text-sm">
                  {tab === 'archived' ? 'No archived projects.' : 'No active projects found in workspace.'}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {projects.map(p => {
                const m = meta[p.id];
                return (
                  <ProjectCard
                    key={p.id}
                    project={{ id: p.id, identifier: p.identifier, name: p.name, description: p.description }}
                    stats={m?.stat ?? { total: 0, open: 0, done: 0 }}
                    archived={tab === 'archived'}
                    canArchive={m?.canArchive ?? false}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
