import { PageLoadingSkeleton } from "@/components/page-loading-skeleton";

export default function Loading() {
  return (
    <PageLoadingSkeleton
      title="User Management"
      description="Loading team accounts, roles, and per-user settings."
      variant="table"
    />
  );
}
