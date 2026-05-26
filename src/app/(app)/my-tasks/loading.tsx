import { PageLoadingSkeleton } from "@/components/page-loading-skeleton";

export default function Loading() {
  return (
    <PageLoadingSkeleton
      title="My Tasks"
      description="Loading your tasks across every project."
      variant="kanban"
    />
  );
}
