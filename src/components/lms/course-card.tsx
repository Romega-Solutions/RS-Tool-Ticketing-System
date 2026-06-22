import Link from 'next/link';
import { ProgressBar } from './progress-bar';
import { stripMarkdown } from './course-summary';
import type { LmsCourse } from '@/lib/lms';

export function CourseCard({
  course,
  completed,
  total,
  percent,
}: {
  course: LmsCourse;
  completed: number;
  total:     number;
  percent:   number;
}) {
  const scopeLabel =
    course.scope === 'foundation' ? 'Foundation' :
    course.scope === 'intern'     ? 'Intern Track' :
    course.department ?? 'Department';
  const isRequired = course.enforcement === 'hard';
  const done = total > 0 && completed === total;

  return (
    <Link
      href={`/learning/${course.id}`}
      className="group relative block rounded-xl border border-(--rs-neutral-grey-200) bg-white p-4 hover:border-(--rs-primary-300) hover:shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-300) focus-visible:border-(--rs-primary-300)"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-(--rs-primary-600) font-medium">{scopeLabel}</span>
            {isRequired && (
              <span className="rounded-full bg-red-50 text-red-700 px-2 py-0.5 text-[10px] font-semibold">
                Required
              </span>
            )}
            {done && (
              <span className="rounded-full bg-green-50 text-green-700 px-2 py-0.5 text-[10px] font-semibold">
                Completed
              </span>
            )}
          </div>
          <h3 className="mt-1 font-serif text-base font-semibold text-(--rs-neutral-grey-900) group-hover:text-(--rs-primary-700)">
            {course.title}
          </h3>
          {course.description && (
            <p className="mt-1.5 text-sm leading-relaxed text-(--rs-neutral-grey-600) line-clamp-2">
              {stripMarkdown(course.description)}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3">
        <ProgressBar
          percent={percent}
          label={total === 0 ? 'No lessons yet' : `${completed} of ${total} lessons`}
        />
      </div>
    </Link>
  );
}
