import { PageLoadingSkeleton } from "@/components/page-loading-skeleton";

export default function Loading() {
  return (
    <PageLoadingSkeleton
      title="Projects"
      description="Loading active projects in the Romega Solutions workspace."
      variant="grid"
    />
  );
}
