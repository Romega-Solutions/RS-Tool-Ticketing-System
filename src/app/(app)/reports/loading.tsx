import { PageLoadingSkeleton } from "@/components/page-loading-skeleton";

export default function Loading() {
  return (
    <PageLoadingSkeleton
      title="Weekly Reports"
      description="Loading the weekly report generator."
      variant="form"
    />
  );
}
