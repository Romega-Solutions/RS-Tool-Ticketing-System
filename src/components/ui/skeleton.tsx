import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "bg-(--rs-neutral-grey-100) animate-skeleton-wave rounded-md",
        className,
      )}
    />
  );
}
