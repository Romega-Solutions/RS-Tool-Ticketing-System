import Link from 'next/link';
import { getProjects, getProjectStates, getWorkItems, buildStateLookup, enrichWorkItems } from '@/lib/plane';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Briefcase } from 'lucide-react';

export default async function ProjectsPage() {
  let projects: Awaited<ReturnType<typeof getProjects>> = [];
  let stats: Record<string, { total: number; open: number; done: number }> = {};
  let planeError: string | null = null;

  try {
    projects = await getProjects();
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
    planeError = err instanceof Error ? err.message : 'Failed to connect to Plane';
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">Projects</h1>
        <p className="text-(--rs-neutral-grey-500) text-sm mt-1">All active projects in the Romega Solutions workspace.</p>
      </div>

      {planeError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
          <strong>Plane connection failed:</strong> {planeError}. Check PLANE_BASE_URL, PLANE_API_KEY, and PLANE_WORKSPACE_SLUG in <code>.env</code>.
        </div>
      )}

      {projects.length === 0 && !planeError && (
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

      {projects.length === 0 && planeError && (
        <div className="flex flex-col items-center justify-center py-16 text-(--rs-neutral-grey-400)">
          <Briefcase className="w-12 h-12 mb-4 opacity-30" />
          <p className="text-sm">Projects will appear here once Plane is connected.</p>
        </div>
      )}
    </div>
  );
}
