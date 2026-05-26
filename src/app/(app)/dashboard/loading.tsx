import { PageLoadingSkeleton } from "@/components/page-loading-skeleton";

export default function Loading() {
  return (
    <PageLoadingSkeleton
      title="Dashboard"
      description="Loading project stats, attendance, weekly reports, and your hours."
      variant="page"
    />
  );
}
