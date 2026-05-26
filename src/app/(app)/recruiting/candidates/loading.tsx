import { PageLoadingSkeleton } from "@/components/page-loading-skeleton";

export default function Loading() {
  return (
    <PageLoadingSkeleton
      title="Applicant Tracking"
      description="Loading the candidate pipeline."
      variant="kanban"
    />
  );
}
