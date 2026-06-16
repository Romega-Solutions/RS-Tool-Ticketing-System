import { Skeleton } from '@/components/ui/skeleton';

// Route-level loading UI for the learner learning segment (index, course detail,
// certificates). These pages are force-dynamic with DB + signed-URL + photo
// round-trips, so Next.js shows this instantly on navigation instead of a
// frozen page. The lesson route has its own, more specific skeleton.
export default function LearningLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      {Array.from({ length: 2 }).map((_, s) => (
        <section key={s} className="space-y-3">
          <Skeleton className="h-5 w-40" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 2 }).map((_, c) => (
              <div key={c} className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-4 space-y-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
