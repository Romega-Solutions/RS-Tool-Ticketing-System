import Link from 'next/link';
import { redirect } from 'next/navigation';
import { GraduationCap } from 'lucide-react';
import { getSession } from '@/lib/session';
import { visibleCoursesFor, progressForCourses, type LmsCourse } from '@/lib/lms';
import { CourseCard } from '@/components/lms/course-card';

export const dynamic = 'force-dynamic';

export default async function LearningIndexPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const courses = await visibleCoursesFor({
    userId: session.id,
    role:   session.role,
    team:   session.team,
  });

  const progress = await progressForCourses(session.id, courses.map(c => c.id));

  const grouped: Record<string, LmsCourse[]> = {
    foundation: courses.filter(c => c.scope === 'foundation'),
    intern:     courses.filter(c => c.scope === 'intern'),
    department: courses.filter(c => c.scope === 'department'),
  };

  const hasAny = courses.length > 0;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-(--rs-neutral-grey-900)">My Learning</h1>
          <p className="mt-1 text-sm text-(--rs-neutral-grey-500)">
            Foundation training plus the courses assigned to your role and team.
          </p>
        </div>
        <Link
          href="/learning/certificates"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-(--rs-neutral-grey-200) bg-white px-3 py-2 text-sm font-semibold text-(--rs-primary-600) transition-colors hover:bg-(--rs-primary-50)"
        >
          <GraduationCap className="h-4 w-4" />
          My Certificates
        </Link>
      </header>

      {!hasAny && (
        <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-8 text-center">
          <p className="text-sm text-(--rs-neutral-grey-500)">
            No courses are published for your role yet. Check back after an admin publishes the Foundation track.
          </p>
        </div>
      )}

      {grouped.foundation.length > 0 && (
        <CourseSection title="Foundation" courses={grouped.foundation} progress={progress} />
      )}
      {grouped.intern.length > 0 && (
        <CourseSection title="Intern Track" courses={grouped.intern} progress={progress} />
      )}
      {grouped.department.length > 0 && (
        <CourseSection
          title={`${session.team ?? 'Department'} — Department`}
          courses={grouped.department}
          progress={progress}
        />
      )}
    </div>
  );
}

function CourseSection({
  title,
  courses,
  progress,
}: {
  title:   string;
  courses: LmsCourse[];
  progress: Map<number, { completed: number; total: number; percent: number }>;
}) {
  return (
    <section>
      <h2 className="font-serif text-lg font-semibold text-(--rs-neutral-grey-800) mb-3">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {courses.map(course => {
          const p = progress.get(course.id) ?? { completed: 0, total: 0, percent: 0 };
          return (
            <CourseCard
              key={course.id}
              course={course}
              completed={p.completed}
              total={p.total}
              percent={p.percent}
            />
          );
        })}
      </div>
    </section>
  );
}
