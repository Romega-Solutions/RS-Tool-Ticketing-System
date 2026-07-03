import { PageLoadingSkeleton } from '@/components/page-loading-skeleton';

export default function Loading() {
  return (
    <PageLoadingSkeleton
      title="Position Applicants"
      description="Loading applicants for this job post."
      variant="table"
    />
  );
}
