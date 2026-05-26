import { PageLoadingSkeleton } from "@/components/page-loading-skeleton";

export default function Loading() {
  return (
    <PageLoadingSkeleton
      title="Live Presence"
      description="Loading live presence dashboard."
      variant="page"
    />
  );
}
