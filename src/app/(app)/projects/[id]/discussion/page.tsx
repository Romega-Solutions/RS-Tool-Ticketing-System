import { getProjects, getProjectMembers, getProjectComments } from '@/lib/tickets';
import { getSession } from '@/lib/session';
import { getProjectCaps } from '@/lib/permissions';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ProjectDiscussionClient } from '@/components/project-discussion-client';

export default async function ProjectDiscussionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ comment?: string }>;
}) {
  const { id } = await params;
  const { comment } = await searchParams;
  const session = await getSession();
  if (!session) redirect('/login');

  // Per-project access: members/leads (+ admins) only; non-members are bounced.
  const caps = await getProjectCaps(session, Number(id));
  if (!caps.canView) redirect('/projects');

  const projects = await getProjects();
  const project = projects.find(p => p.id === id);
  if (!project) notFound();

  const [members, comments] = await Promise.all([
    getProjectMembers(id),
    getProjectComments(id),
  ]);

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">
            {project.name} — Discussion
          </h1>
          <p className="text-(--rs-neutral-grey-500) text-sm mt-1">
            General updates and discussion for the whole project.
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

      <ProjectDiscussionClient
        projectId={id}
        initialComments={comments}
        members={members}
        currentUserId={session.id}
        isAdmin={session.role === 'admin'}
        canComment={caps.canComment}
        initialFocusCommentId={comment ?? null}
      />
    </div>
  );
}
