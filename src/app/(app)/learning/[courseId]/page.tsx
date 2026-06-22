import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSession } from '@/lib/session';
import { getCourseWithLessons, userInCourseAudience, courseProgress } from '@/lib/lms';
import { createAdminClient } from '@/lib/supabase/admin';
import { ProgressBar } from '@/components/lms/progress-bar';
import { CourseSummary } from '@/components/lms/course-summary';

export const dynamic = 'force-dynamic';

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const id = Number(courseId);
  if (!Number.isInteger(id)) notFound();

  const session = await getSession();
  if (!session) redirect('/login');

  const data = await getCourseWithLessons(id);
  if (!data || !data.course.isPublished) notFound();
  const { course, lessons } = data;

  // Permission gate — learner pages should not reveal courses outside the
  // user's audience. Admins and CEOs see everything.
  const isAdmin = session.role === 'admin';
  const inAudience = userInCourseAudience(course, {
    userId: session.id,
    role:   session.role,
    team:   session.team,
  });
  if (!isAdmin && !inAudience) notFound();

  const progress = await courseProgress(session.id, course.id);

  // Pull this user's completed lesson IDs in one shot to render checkmarks.
  const admin = createAdminClient();
  const { data: completed } = await admin
    .from('lms_lesson_completions')
    .select('lesson_id')
    .eq('user_id', session.id)
    .in('lesson_id', lessons.map(l => l.id).length ? lessons.map(l => l.id) : [-1]);
  const completedIds = new Set((completed ?? []).map((r: { lesson_id: number }) => r.lesson_id));

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-3">
        <Link href="/learning" className="inline-flex items-center gap-1.5 text-xs font-medium text-(--rs-primary-600) hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> My Learning
        </Link>
        <h1 className="font-serif text-3xl font-bold leading-tight text-(--rs-neutral-grey-900)">
          {course.title}
        </h1>
        {lessons.length > 0 && (
          <div className="max-w-md pt-1">
            <ProgressBar
              percent={progress.percent}
              label={`${progress.completed} of ${progress.total} lessons`}
            />
          </div>
        )}
      </header>

      {course.description && (
        <section className="rounded-2xl border border-(--rs-neutral-grey-200) bg-white p-6 sm:p-8 shadow-sm">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-(--rs-neutral-grey-500)">
            About this course
          </h2>
          <hr className="my-4 border-(--rs-neutral-grey-100)" />
          <CourseSummary md={course.description} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-(--rs-neutral-grey-500)">
          Lessons
        </h2>
        {lessons.length === 0 ? (
          <p className="text-sm italic text-(--rs-neutral-grey-400)">
            This course has no lessons yet.
          </p>
        ) : (
          <ul className="rounded-xl border border-(--rs-neutral-grey-200) divide-y divide-(--rs-neutral-grey-100) bg-white">
          {lessons.map((lesson, idx) => {
            const done = completedIds.has(lesson.id);
            const icon =
              lesson.lessonType === 'video' ? '▶' :
              lesson.lessonType === 'mixed' ? '◐' :
              '📄';
            return (
              <li key={lesson.id}>
                <Link
                  href={`/learning/${course.id}/${lesson.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-(--rs-neutral-grey-50)"
                >
                  <span className="w-6 text-center text-(--rs-neutral-grey-400)">{idx + 1}</span>
                  <span className="text-base" aria-hidden>{icon}</span>
                  <span className="flex-1 truncate text-sm font-medium text-(--rs-neutral-grey-900)">
                    {lesson.title}
                  </span>
                  {done && (
                    <span className="inline-block w-5 h-5 rounded-full bg-green-100 text-green-700 text-xs leading-5 text-center">
                      ✓
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
          </ul>
        )}
      </section>
    </div>
  );
}
