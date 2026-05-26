import { PageLoadingSkeleton } from "@/components/page-loading-skeleton";

export default function Loading() {
  return (
    <PageLoadingSkeleton
      title="Status Report"
      description="Loading your weekly status report."
      variant="form"
    />
  );
}
