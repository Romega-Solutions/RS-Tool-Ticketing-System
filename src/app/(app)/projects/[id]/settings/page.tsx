import { redirect, notFound } from 'next/navigation';
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
  if (!canManageProject(session)) redirect(`/projects/${(await params).id}`);

  const { id } = await params;
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
      <div>
        <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">
          {project.name} — Settings
        </h1>
        <p className="text-(--rs-neutral-grey-500) text-sm mt-1">
          Manage project details, labels, members, and cycles.
        </p>
      </div>

      <ProjectSettingsClient
        projectId={id}
        initialProject={{
          name: project.name,
          description: project.description,
          team: project.team,
        }}
        canReteam={canReteamProject(session)}
        initialLabels={labels}
        initialMembers={members}
        initialCycles={cycles}
      />
    </div>
  );
}
