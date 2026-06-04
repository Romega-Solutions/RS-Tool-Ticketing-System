import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { canAccessAdmin, normalizeRole } from '@/lib/rbac';
import { createAdminClient } from '@/lib/supabase/admin';
import { userInCourseAudience, type LmsCourse, type LmsScope, type LmsEnforcement } from '@/lib/lms';
import { CourseNav } from '@/components/learning/course-nav.client';

export const dynamic = 'force-dynamic';

export default async function AdminRosterPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const id = Number(courseId);
  if (!Number.isInteger(id)) notFound();

  const session = await getSession();
  if (!session) redirect('/login');
  if (!canAccessAdmin(session.role)) redirect('/dashboard');

  const admin = createAdminClient();
  const { data: courseRow } = await admin
    .from('lms_courses').select('*').eq('id', id).maybeSingle();
  if (!courseRow) notFound();
  const course: LmsCourse = {
    id: courseRow.id, title: courseRow.title, description: courseRow.description,
    scope: courseRow.scope as LmsScope, department: courseRow.department,
    coverImageUrl: courseRow.cover_image_url, isPublished: courseRow.is_published,
    enforcement: courseRow.enforcement as LmsEnforcement, sortOrder: courseRow.sort_order,
    createdAt: courseRow.created_at, updatedAt: courseRow.updated_at,
  };

  const { data: users } = await admin
    .from('users')
    .select('id, name, email, team, role, is_active')
    .eq('is_active', 1)
    .order('name', { ascending: true });

  const { data: lessons } = await admin.from('lms_lessons').select('id').eq('course_id', id);
  const lessonIds = ((lessons ?? []) as { id: number }[]).map(l => l.id);
  const total = lessonIds.length;

  const { data: completions } = total > 0
    ? await admin.from('lms_lesson_completions').select('user_id, lesson_id').in('lesson_id', lessonIds)
    : { data: [] as Array<{ user_id: number; lesson_id: number }> };
  const completedByUser = new Map<number, number>();
  for (const c of (completions ?? [])) {
    completedByUser.set(c.user_id, (completedByUser.get(c.user_id) ?? 0) + 1);
  }

  const { data: assigns } = await admin
    .from('lms_course_assignments').select('user_id, due_at').eq('course_id', id);
  type ARow = { user_id: number; due_at: string | null };
  const dueByUser = new Map<number, string | null>(
    ((assigns ?? []) as ARow[]).map(a => [a.user_id, a.due_at]),
  );

  const { data: certs } = await admin
    .from('lms_certificates').select('user_id').eq('course_id', id);
  const certifiedSet = new Set(((certs ?? []) as { user_id: number }[]).map(c => c.user_id));

  // Roster = users whose role/team falls into the audience OR who have an
  // explicit assignment row.
  type URow = { id: number; name: string; email: string; team: string | null; role: string };
  const visibleUsers = ((users ?? []) as URow[]).filter(u => {
    const auto = userInCourseAudience(course, {
      userId: u.id, role: normalizeRole(u.role), team: u.team,
    });
    return auto || dueByUser.has(u.id);
  });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link href={`/admin/learning/${id}`} className="text-xs text-(--rs-primary-600) hover:underline">
          ← {course.title}
        </Link>
        <h1 className="font-serif text-2xl font-semibold text-(--rs-neutral-grey-900)">
          Roster — {course.title}
        </h1>
      </header>

      <CourseNav courseId={id} />

      <div className="overflow-x-auto rounded-xl border border-(--rs-neutral-grey-200) bg-white">
        <table className="w-full text-sm">
          <thead className="bg-(--rs-neutral-grey-50) text-left text-(--rs-neutral-grey-500) text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Team / Role</th>
              <th className="px-4 py-3">Progress</th>
              <th className="px-4 py-3">Due date</th>
              <th className="px-4 py-3">Certified</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-(--rs-neutral-grey-100)">
            {visibleUsers.map(u => {
              const completed = completedByUser.get(u.id) ?? 0;
              const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
              const due = dueByUser.get(u.id);
              return (
                <tr key={u.id} className="hover:bg-(--rs-neutral-grey-50)">
                  <td className="px-4 py-3 font-medium text-(--rs-neutral-grey-900)">{u.name}</td>
                  <td className="px-4 py-3 text-(--rs-neutral-grey-700)">
                    {u.team ?? '—'} · {u.role}
                  </td>
                  <td className="px-4 py-3 text-(--rs-neutral-grey-700)">{completed} / {total} ({pct}%)</td>
                  <td className="px-4 py-3 text-(--rs-neutral-grey-700)">
                    {due ? new Date(due).toLocaleDateString('en-US') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {certifiedSet.has(u.id) ? (
                      <span className="inline-flex rounded-full bg-green-50 text-green-700 px-2 py-0.5 text-xs font-semibold">✓</span>
                    ) : (
                      <span className="text-(--rs-neutral-grey-400)">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
