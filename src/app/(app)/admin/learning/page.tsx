import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { canAccessAdmin } from '@/lib/rbac';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Row = {
  id: number; title: string; scope: string; department: string | null;
  enforcement: string; is_published: number; created_at: string;
  lesson_count?: number;
};

export default async function AdminLearningPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!canAccessAdmin(session.role)) redirect('/dashboard');

  const admin = createAdminClient();
  const { data: courses } = await admin
    .from('lms_courses')
    .select('id, title, scope, department, enforcement, is_published, created_at')
    .order('created_at', { ascending: false });

  // Lesson counts (one query, group client-side).
  const { data: lessonCounts } = await admin
    .from('lms_lessons')
    .select('course_id');
  const counts = new Map<number, number>();
  for (const row of (lessonCounts ?? []) as { course_id: number }[]) {
    counts.set(row.course_id, (counts.get(row.course_id) ?? 0) + 1);
  }
  const rows: Row[] = (courses ?? []).map(c => ({ ...c, lesson_count: counts.get(c.id) ?? 0 }));

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-(--rs-neutral-grey-900)">Manage Learning</h1>
          <p className="mt-1 text-sm text-(--rs-neutral-grey-500)">
            Create and publish courses. Lessons can be text, video, or both.
          </p>
        </div>
        <Link
          href="/admin/learning/new"
          className="rounded-lg bg-(--rs-primary-500) text-white text-sm font-semibold px-4 py-2 hover:bg-(--rs-primary-600)"
        >
          New course
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-8 text-center">
          <p className="text-sm text-(--rs-neutral-grey-500)">No courses yet. Create the first one.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-(--rs-neutral-grey-200) bg-white">
          <table className="w-full text-sm">
            <thead className="bg-(--rs-neutral-grey-50) text-left text-(--rs-neutral-grey-500) text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Scope</th>
                <th className="px-4 py-3">Lessons</th>
                <th className="px-4 py-3">Enforcement</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--rs-neutral-grey-100)">
              {rows.map(c => (
                <tr key={c.id} className="hover:bg-(--rs-neutral-grey-50)">
                  <td className="px-4 py-3">
                    <Link href={`/admin/learning/${c.id}`} className="font-medium text-(--rs-primary-700) hover:underline">
                      {c.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-(--rs-neutral-grey-700)">
                    {c.scope === 'department' ? `Department · ${c.department ?? '—'}` : c.scope}
                  </td>
                  <td className="px-4 py-3 text-(--rs-neutral-grey-700)">{c.lesson_count ?? 0}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                      c.enforcement === 'hard'
                        ? 'bg-red-50 text-red-700'
                        : 'bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-700)'
                    }`}>
                      {c.enforcement}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {c.is_published ? (
                      <span className="inline-flex rounded-full bg-green-50 text-green-700 px-2 py-0.5 text-xs font-semibold">
                        Published
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-(--rs-neutral-grey-100) text-(--rs-neutral-grey-600) px-2 py-0.5 text-xs font-semibold">
                        Draft
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
