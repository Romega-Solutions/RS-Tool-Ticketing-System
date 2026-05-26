import { PageLoadingSkeleton } from "@/components/page-loading-skeleton";

export default function Loading() {
  return (
    <PageLoadingSkeleton
      title="Rates & Currency"
      description="Loading hourly rates and live USD→PHP."
      variant="table"
    />
  );
}
