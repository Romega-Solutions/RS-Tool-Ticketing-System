import { PageLoadingSkeleton } from "@/components/page-loading-skeleton";

export default function Loading() {
  return (
    <PageLoadingSkeleton
      title="Attendance"
      description="Loading this week's attendance grid."
      variant="table"
    />
  );
}
