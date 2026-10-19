import { getProjects, getProjectMembers, getProjectComments } from '@/lib/tickets';
import { getSession } from '@/lib/session';
import { getProjectCaps } from '@/lib/permissions';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import { projectPath } from '@/lib/project-slug';
import { resolveProjectParam } from '@/lib/project-slug-server';
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
  const { id: rawId } = await params;
  const query = await searchParams;
  const { comment } = query;
  const session = await getSession();
  if (!session) redirect('/login');

  // Slug or numeric id; unknown keys behave like a missing numeric id.
  const resolved = await resolveProjectParam(rawId);
  const id = String(resolved?.id ?? 0);

  // Per-project access: members/leads (+ admins) only; non-members are bounced.
  const caps = await getProjectCaps(session, Number(id));
  if (!caps.canView) redirect('/projects');

  if (resolved?.slug && rawId !== resolved.slug) {
    permanentRedirect(projectPath(resolved, 'discussion', query));
  }
  const projectRef = { id, slug: resolved?.slug ?? null };

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
          href={projectPath(projectRef)}
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
