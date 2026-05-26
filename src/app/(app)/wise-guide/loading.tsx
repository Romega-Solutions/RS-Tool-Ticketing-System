import { PageLoadingSkeleton } from "@/components/page-loading-skeleton";

export default function Loading() {
  return (
    <PageLoadingSkeleton
      title="Wise Integration"
      description="Loading the Wise payouts walkthrough."
      variant="form"
    />
  );
}
