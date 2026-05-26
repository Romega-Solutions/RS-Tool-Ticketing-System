import { Skeleton } from "@/components/ui/skeleton";

type Variant = "page" | "grid" | "table" | "form" | "kanban";

export function PageLoadingSkeleton({
  variant = "page",
  title,
  description,
}: {
  variant?: Variant;
  title?: string;
  description?: string;
}) {
  return (
    <div className="space-y-6 animate-fade-in" aria-busy="true" aria-live="polite">
      <PageHeader title={title} description={description} />
      <LoadingPill />
      {variant === "page"   && <PageBody />}
      {variant === "grid"   && <GridBody />}
      {variant === "table"  && <TableBody />}
      {variant === "form"   && <FormBody />}
      {variant === "kanban" && <KanbanBody />}
    </div>
  );
}

function PageHeader({ title, description }: { title?: string; description?: string }) {
  if (title) {
    return (
      <div className="min-w-0">
        <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900) leading-tight">
          {title}
        </h1>
        {description && (
          <p className="text-(--rs-neutral-grey-500) text-sm mt-1 max-w-2xl">{description}</p>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-72" />
    </div>
  );
}

function LoadingPill() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-(--rs-primary-100) bg-(--rs-primary-50)/60 px-3 py-1.5 text-xs font-semibold text-(--rs-primary-700) shadow-sm">
      <span className="relative flex h-3.5 w-8 items-center rounded-full border border-(--rs-primary-200) bg-white/70 px-[2px]">
        <span className="absolute -right-[3px] h-1.5 w-1 rounded-r-full bg-(--rs-primary-200)" />
        <span className="h-2 w-[55%] rounded-full bg-linear-to-r from-(--rs-primary-400) via-(--rs-primary-500) to-(--rs-accent-400) animate-battery-charge" />
      </span>
      Loading page
    </div>
  );
}

function PageBody() {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} delay={i * 60}>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-8 w-20" />
            <Skeleton className="mt-2 h-3 w-32" />
          </Card>
        ))}
      </div>

      <Card delay={140}>
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-4 h-40 w-full" />
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} delay={200 + i * 60}>
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-3 h-6 w-32" />
            <Skeleton className="mt-2 h-1.5 w-full rounded-full" />
          </Card>
        ))}
      </div>
    </>
  );
}

function GridBody() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} delay={i * 60}>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded" />
            <Skeleton className="h-5 w-36" />
          </div>
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-1.5 h-3 w-3/4" />
          <Skeleton className="mt-4 h-1.5 w-full rounded-full" />
        </Card>
      ))}
    </div>
  );
}

function TableBody() {
  return (
    <Card delay={80}>
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3" style={{ opacity: 1 - i * 0.07 }}>
            <Skeleton className="h-9 w-9 rounded-full shrink-0" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-24 hidden sm:block" />
            <Skeleton className="h-4 w-20 hidden md:block" />
            <Skeleton className="h-7 w-7 rounded shrink-0" />
          </div>
        ))}
      </div>
    </Card>
  );
}

function FormBody() {
  return (
    <Card delay={80}>
      <div className="space-y-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-3 w-24 mb-2" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
        <Skeleton className="h-10 w-32 mt-4" />
      </div>
    </Card>
  );
}

function KanbanBody() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, col) => (
        <div key={col} className="space-y-3" style={{ animationDelay: `${col * 60}ms` }}>
          <Skeleton className="h-4 w-24" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} delay={col * 60 + i * 40} compact>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="mt-2 h-3 w-2/3" />
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
}

function Card({ children, delay = 0, compact = false }: { children: React.ReactNode; delay?: number; compact?: boolean }) {
  return (
    <div
      className={`rounded-xl border border-(--rs-neutral-grey-200) bg-white shadow-sm animate-lead-card ${compact ? "p-3" : "p-5"}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
