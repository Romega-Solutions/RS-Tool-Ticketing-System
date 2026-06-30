import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSession } from '@/lib/session';
import { getProjects, getLabels, getProjectMembers, getCycles } from '@/lib/tickets';
import { canManageProject, canReteamProject } from '@/lib/permissions';
import { ProjectSettingsClient } from '@/components/project-settings-client';

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { id } = await params;
  if (!(await canManageProject(session, Number(id)))) redirect(`/projects/${id}`);

  const projects = await getProjects();
  const project = projects.find(p => p.id === id);
  if (!project) notFound();

  const [labels, members, cycles] = await Promise.all([
    getLabels(id),
    getProjectMembers(id),
    getCycles(id),
  ]);

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">
            {project.name} — Settings
          </h1>
          <p className="text-(--rs-neutral-grey-500) text-sm mt-1">
            Manage project details, labels, members, and cycles.
          </p>
        </div>
        <Link
          href={`/projects/${id}`}
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md border border-(--rs-neutral-grey-200) bg-white px-3 py-2 text-sm font-medium text-(--rs-neutral-grey-700) transition-colors hover:bg-(--rs-neutral-grey-50) hover:text-(--rs-neutral-grey-900) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-300) sm:self-auto"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to project
        </Link>
      </div>

      <ProjectSettingsClient
        projectId={id}
        initialProject={{
          name: project.name,
          description: project.description,
          team: project.team,
          autoArchiveDoneDays: project.autoArchiveDoneDays,
        }}
        canReteam={await canReteamProject(session, Number(id))}
        initialLabels={labels}
        initialMembers={members}
        initialCycles={cycles}
      />
    </div>
  );
}
