import Link from 'next/link';
import { Activity, FolderPlus, Archive } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { ProjectActivityEntry } from '@/lib/tickets';

function formatActivityTime(ts: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Read-only feed of project lifecycle events (created + archived), newest first.
 * Mirrors the dashboard "Recent Activity" visual style.
 */
export function ProjectActivityFeed({ entries }: { entries: ProjectActivityEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-(--rs-neutral-grey-400)">
        <Activity className="mb-4 h-12 w-12 opacity-30" aria-hidden="true" />
        <p className="text-sm">No project activity yet.</p>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="py-2">
        <ul className="divide-y divide-(--rs-neutral-grey-100)">
          {entries.map((entry) => {
            const created = entry.action === 'created';
            return (
              <li key={`${entry.projectId}-${entry.action}`}>
                <Link
                  href={`/projects/${entry.projectId}`}
                  className="flex items-start gap-3 rounded-md py-3 transition-colors hover:bg-(--rs-neutral-grey-50) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-300)"
                >
                  <span
                    className={
                      created
                        ? 'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-(--rs-primary-50) text-(--rs-primary-600)'
                        : 'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-600)'
                    }
                  >
                    {created
                      ? <FolderPlus className="h-4 w-4" aria-hidden="true" />
                      : <Archive className="h-4 w-4" aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-semibold text-(--rs-neutral-grey-800)">
                        {created ? 'Project created' : 'Project archived'}
                      </span>
                      <span className="text-xs text-(--rs-neutral-grey-400)">
                        {formatActivityTime(entry.at)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-(--rs-neutral-grey-700)">
                      {entry.identifier ? `${entry.identifier} · ` : ''}{entry.projectName}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
