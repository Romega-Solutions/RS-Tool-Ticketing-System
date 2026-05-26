import { PageLoadingSkeleton } from "@/components/page-loading-skeleton";

export default function Loading() {
  return (
    <PageLoadingSkeleton
      title="Sales / Leads"
      description="Loading the sales pipeline."
      variant="table"
    />
  );
}
