import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import { getSession } from '@/lib/session';
import { visibleCoursesFor, progressForCourses } from '@/lib/lms';
import { ProgressBar } from './progress-bar';

// Dashboard-mounted card. Renders nothing if the user has no incomplete
// soft-enforced courses — so it stays invisible once everything's done.
export async function LearningBanner() {
  const session = await getSession();
  if (!session) return null;

  let courses;
  try {
    courses = await visibleCoursesFor({
      userId: session.id,
      role:   session.role,
      team:   session.team,
    });
  } catch {
    return null;
  }
  if (courses.length === 0) return null;

  const progress = await progressForCourses(session.id, courses.map(c => c.id));
  const incomplete = courses.filter(c => {
    const p = progress.get(c.id);
    return !!p && p.total > 0 && p.completed < p.total;
  });
  if (incomplete.length === 0) return null;

  const top = incomplete.slice(0, 3);

  return (
    <div className="rounded-xl border border-(--rs-primary-100) bg-(--rs-primary-50) p-4">
      <div className="flex items-center gap-2">
        <GraduationCap className="w-4 h-4 text-(--rs-primary-600)" />
        <h2 className="font-serif text-sm font-semibold text-(--rs-primary-700)">
          Continue learning
        </h2>
        <Link
          href="/learning"
          className="ml-auto text-xs text-(--rs-primary-600) hover:underline"
        >
          See all
        </Link>
      </div>
      <ul className="mt-3 space-y-3">
        {top.map(c => {
          const p = progress.get(c.id)!;
          return (
            <li key={c.id}>
              <Link href={`/learning/${c.id}`} className="block group">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-(--rs-neutral-grey-900) group-hover:text-(--rs-primary-700) truncate">
                    {c.title}
                  </span>
                  <span className="text-xs text-(--rs-neutral-grey-500) shrink-0">
                    {p.completed}/{p.total}
                  </span>
                </div>
                <div className="mt-1.5">
                  <ProgressBar percent={p.percent} />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
