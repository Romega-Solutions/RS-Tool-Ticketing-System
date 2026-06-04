import { Skeleton } from '@/components/ui/skeleton';

// Route-level loading UI for the whole admin-learning segment (list, course,
// lesson, assign, roster). Next.js shows this instantly on navigation so the
// page never looks frozen while server data loads.
export default function AdminLearningLoading() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-7 w-64" />
      </div>

      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-6 space-y-4">
          <Skeleton className="h-5 w-40" />
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
