import Link from 'next/link';
import { Lock, ArrowRight } from 'lucide-react';
import type { QuizGate } from '@/lib/lms-quiz';

// Shown in place of the QuizRunner when earlier lessons aren't finished yet.
// Lists the remaining lessons (each a direct link) and a primary CTA to the
// next incomplete one, so the learner always has an obvious next step.
export function QuizLockedCard({ courseId, gate }: { courseId: number; gate: QuizGate }) {
  return (
    <div className="rounded-xl border border-(--rs-accent-200) bg-(--rs-accent-50) p-5">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--rs-accent-100) text-(--rs-accent-700)"
          aria-hidden
        >
          <Lock className="h-4 w-4" />
        </span>
        <div className="space-y-1">
          <h3 className="font-serif text-base font-semibold text-(--rs-neutral-grey-900)">
            Quiz locked
          </h3>
          <p className="text-sm text-(--rs-neutral-grey-600)">
            Finish the earlier lessons in this course to unlock the quiz.
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-1">
        {gate.remaining.map((lesson) => (
          <li key={lesson.id}>
            <Link
              href={`/learning/${courseId}/${lesson.id}`}
              className="group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-(--rs-neutral-grey-800) transition-colors duration-200 hover:bg-white/70"
            >
              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-(--rs-accent-400)" aria-hidden />
              <span className="flex-1 truncate group-hover:text-(--rs-primary-700)">{lesson.title}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-(--rs-neutral-grey-400) group-hover:text-(--rs-primary-600)" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>

      {gate.nextLessonId !== null && (
        <Link
          href={`/learning/${courseId}/${gate.nextLessonId}`}
          className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-(--rs-primary-500) px-4 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-(--rs-primary-600) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-300)"
        >
          Go to next lesson
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}
