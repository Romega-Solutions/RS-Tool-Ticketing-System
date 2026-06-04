import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { canAccessAdmin, normalizeRole } from '@/lib/rbac';
import { createAdminClient } from '@/lib/supabase/admin';
import { userInCourseAudience, type LmsCourse } from '@/lib/lms';
import { Card, CardContent } from '@/components/ui/card';
import { BookOpen, Users, GraduationCap, BarChart3 } from 'lucide-react';

export const dynamic = 'force-dynamic';

type CourseRow = {
  id: number; title: string; scope: string; department: string | null;
  enforcement: string; is_published: number; created_at: string;
};

type Metric = {
  id: number; title: string; scope: string; department: string | null;
  enforcement: string; isPublished: boolean;
  lessonCount: number; reach: number; assigned: number; completed: number;
};

function scopeLabel(scope: string, department: string | null): string {
  if (scope === 'department') return `Department · ${department ?? '—'}`;
  if (scope === 'intern') return 'Intern track';
  if (scope === 'foundation') return 'Foundation · everyone';
  return scope;
}

export default async function AdminLearningPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!canAccessAdmin(session.role)) redirect('/dashboard');

  const admin = createAdminClient();

  // One parallel batch — everything the dashboard needs.
  const [
    { data: courses },
    { data: users },
    { data: lessonRows },
    { data: assignRows },
    { data: completionRows },
  ] = await Promise.all([
    admin.from('lms_courses')
      .select('id, title, scope, department, enforcement, is_published, created_at')
      .order('created_at', { ascending: false }),
    admin.from('users').select('id, role, team').eq('is_active', 1),
    admin.from('lms_lessons').select('id, course_id'),
    admin.from('lms_course_assignments').select('course_id, user_id'),
    admin.from('lms_lesson_completions').select('user_id, lesson_id'),
  ]);

  const activeUsers = (users ?? []) as { id: number; role: string; team: string | null }[];

  const lessonIdsByCourse = new Map<number, number[]>();
  for (const l of (lessonRows ?? []) as { id: number; course_id: number }[]) {
    const arr = lessonIdsByCourse.get(l.course_id) ?? [];
    arr.push(l.id);
    lessonIdsByCourse.set(l.course_id, arr);
  }

  const assignedByCourse = new Map<number, Set<number>>();
  for (const a of (assignRows ?? []) as { course_id: number; user_id: number }[]) {
    const s = assignedByCourse.get(a.course_id) ?? new Set<number>();
    s.add(a.user_id);
    assignedByCourse.set(a.course_id, s);
  }

  const completedLessonsByUser = new Map<number, Set<number>>();
  for (const c of (completionRows ?? []) as { user_id: number; lesson_id: number }[]) {
    const s = completedLessonsByUser.get(c.user_id) ?? new Set<number>();
    s.add(c.lesson_id);
    completedLessonsByUser.set(c.user_id, s);
  }

  const reachedUserIds = new Set<number>(); // distinct learners across published courses

  const rows: Metric[] = ((courses ?? []) as CourseRow[]).map(c => {
    const lessonIds   = lessonIdsByCourse.get(c.id) ?? [];
    const assignedSet = assignedByCourse.get(c.id) ?? new Set<number>();
    // "Reach" = active users in the course audience OR explicitly assigned.
    const courseForAudience = { ...c } as unknown as LmsCourse;
    const audience = activeUsers.filter(u =>
      userInCourseAudience(courseForAudience, { userId: u.id, role: normalizeRole(u.role), team: u.team })
      || assignedSet.has(u.id),
    );
    // "Completed" = audience users who finished every lesson.
    let completed = 0;
    if (lessonIds.length > 0) {
      for (const u of audience) {
        const done = completedLessonsByUser.get(u.id);
        if (done && lessonIds.every(lid => done.has(lid))) completed++;
      }
    }
    if (c.is_published) for (const u of audience) reachedUserIds.add(u.id);
    return {
      id: c.id, title: c.title, scope: c.scope, department: c.department,
      enforcement: c.enforcement, isPublished: !!c.is_published,
      lessonCount: lessonIds.length, reach: audience.length,
      assigned: assignedSet.size, completed,
    };
  });

  const publishedRows   = rows.filter(r => r.isPublished);
  const totalCourses    = rows.length;
  const publishedCount  = publishedRows.length;
  const learnersReached = reachedUserIds.size;
  const totalCompletions = publishedRows.reduce((s, r) => s + r.completed, 0);
  const withReach = publishedRows.filter(r => r.reach > 0);
  const avgCompletion = withReach.length === 0
    ? 0
    : Math.round((withReach.reduce((s, r) => s + r.completed / r.reach, 0) / withReach.length) * 100);

  const cards = [
    { label: 'Courses',          value: String(totalCourses), sub: `${publishedCount} published`,          icon: BookOpen,       tint: 'primary' as const },
    { label: 'Learners reached', value: String(learnersReached), sub: 'across published courses',          icon: Users,          tint: 'primary' as const },
    { label: 'Completions',      value: String(totalCompletions), sub: 'all lessons finished',              icon: GraduationCap,  tint: 'accent'  as const },
    { label: 'Avg completion',   value: `${avgCompletion}%`, sub: 'of reach, published courses',           icon: BarChart3,      tint: 'accent'  as const },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-(--rs-neutral-grey-900)">Manage Learning</h1>
          <p className="mt-1 text-sm text-(--rs-neutral-grey-500)">
            Create and publish courses, and track who they reach and how many finish.
          </p>
        </div>
        <Link
          href="/admin/learning/new"
          className="shrink-0 rounded-lg bg-(--rs-primary-500) text-white text-sm font-semibold px-4 py-2 hover:bg-(--rs-primary-600)"
        >
          New course
        </Link>
      </header>

      {/* Dashboard summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(card => (
          <Card key={card.label}>
            <CardContent className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-(--rs-neutral-grey-500)">
                  {card.label}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-(--rs-neutral-grey-900)">{card.value}</p>
                <p className="text-xs text-(--rs-neutral-grey-400) mt-0.5">{card.sub}</p>
              </div>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                card.tint === 'primary' ? 'bg-(--rs-primary-50)' : 'bg-(--rs-accent-50)'
              }`}>
                <card.icon className={`w-5 h-5 ${card.tint === 'primary' ? 'text-(--rs-primary-500)' : 'text-(--rs-accent-500)'}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-8 text-center">
          <p className="text-sm text-(--rs-neutral-grey-500)">No courses yet. Create the first one.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-(--rs-neutral-grey-200) bg-white">
          <table className="w-full text-sm min-w-[680px]">
            <thead className="bg-(--rs-neutral-grey-50) text-left text-(--rs-neutral-grey-500) text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Course</th>
                <th className="px-4 py-3 text-center">Lessons</th>
                <th className="px-4 py-3 text-center">Reach</th>
                <th className="px-4 py-3 text-center">Assigned</th>
                <th className="px-4 py-3">Completed</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--rs-neutral-grey-100)">
              {rows.map(c => {
                const pct = c.reach > 0 ? Math.round((c.completed / c.reach) * 100) : 0;
                return (
                  <tr key={c.id} className="hover:bg-(--rs-neutral-grey-50)">
                    <td className="px-4 py-3">
                      <Link href={`/admin/learning/${c.id}`} className="font-medium text-(--rs-primary-700) hover:underline">
                        {c.title}
                      </Link>
                      <div className="text-xs text-(--rs-neutral-grey-400) mt-0.5">
                        {scopeLabel(c.scope, c.department)} · {c.enforcement} enforcement
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-(--rs-neutral-grey-700)">{c.lessonCount}</td>
                    <td className="px-4 py-3 text-center tabular-nums font-medium text-(--rs-neutral-grey-900)">{c.reach}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-(--rs-neutral-grey-700)">
                      {c.assigned > 0 ? c.assigned : <span className="text-(--rs-neutral-grey-300)">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-(--rs-neutral-grey-100)">
                          <div className="h-full rounded-full bg-(--rs-primary-500)" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="tabular-nums text-xs text-(--rs-neutral-grey-600)">
                          {c.completed}/{c.reach} · {pct}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {c.isPublished ? (
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
