import { PageLoadingSkeleton } from "@/components/page-loading-skeleton";

export default function Loading() {
  return (
    <PageLoadingSkeleton
      title="My Profile"
      description="Loading your profile and reminder preferences."
      variant="form"
    />
  );
}
