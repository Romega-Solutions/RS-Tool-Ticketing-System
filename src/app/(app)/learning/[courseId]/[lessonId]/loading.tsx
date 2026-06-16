import { Skeleton } from '@/components/ui/skeleton';

// Lesson page loads course + lesson + quiz + comments + a re-signed video URL,
// so show a lesson-shaped skeleton (breadcrumb, title, media block, action).
export default function LessonLoading() {
  return (
    <div className="space-y-8 max-w-4xl">
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-2/3" />
      </div>

      <Skeleton className="aspect-video w-full rounded-xl" />

      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
      </div>

      <Skeleton className="h-9 w-36 rounded-lg" />
    </div>
  );
}
