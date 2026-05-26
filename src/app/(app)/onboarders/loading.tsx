import { PageLoadingSkeleton } from "@/components/page-loading-skeleton";

export default function Loading() {
  return (
    <PageLoadingSkeleton
      title="Internal Onboarding"
      description="Loading onboarding tracks."
      variant="grid"
    />
  );
}
