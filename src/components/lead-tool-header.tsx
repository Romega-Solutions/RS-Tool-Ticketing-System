import { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function LeadToolHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 animate-lead-enter">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-(--rs-accent-50) px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-(--rs-accent-700)">
          <Sparkles className="w-3 h-3" />
          {eyebrow}
        </div>
        <h1 className="mt-2 font-serif text-2xl font-bold text-(--rs-neutral-grey-900) leading-tight">
          {title}
        </h1>
        <p className="mt-1.5 text-sm text-(--rs-neutral-grey-500) max-w-2xl leading-relaxed">
          {description}
        </p>
      </div>
      {action && <div className="shrink-0 animate-lead-enter-delayed">{action}</div>}
    </div>
  );
}

export function StatCard({
  icon,
  label,
  value,
  accent = false,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  accent?: boolean;
  hint?: string;
}) {
  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${
        accent ? "border-(--rs-accent-200)" : "border-(--rs-neutral-grey-200)"
      } animate-lead-card`}
    >
      <div className="flex items-center gap-2 text-(--rs-neutral-grey-500)">
        <span className={accent ? "text-(--rs-accent-600)" : "text-(--rs-primary-600)"}>{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p
        className={`mt-2 text-xl font-bold tabular-nums leading-none ${
          accent ? "text-(--rs-accent-700)" : "text-(--rs-neutral-grey-900)"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-(--rs-neutral-grey-400)">{hint}</p>}
    </div>
  );
}

export function ComingSoonCard({
  features,
  buildStatus,
}: {
  features: Array<{ icon: ReactNode; title: string; desc: string }>;
  buildStatus: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-(--rs-neutral-grey-200) bg-white p-6 shadow-sm animate-lead-card">
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex h-2 w-2 rounded-full bg-(--rs-accent-500) animate-pulse" />
        <span className="text-xs font-bold uppercase tracking-wider text-(--rs-neutral-grey-700)">
          In design — coming soon
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {features.map((f, i) => (
          <div
            key={i}
            className="rounded-lg border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) p-4"
          >
            <div className="flex items-center gap-2 text-(--rs-primary-600)">
              {f.icon}
              <span className="text-[11px] font-bold uppercase tracking-wider">{f.title}</span>
            </div>
            <p className="mt-2 text-sm text-(--rs-neutral-grey-600) leading-snug">{f.desc}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-lg bg-(--rs-primary-50) border border-(--rs-primary-100) p-4 text-sm text-(--rs-neutral-grey-700) leading-relaxed">
        {buildStatus}
      </div>
    </div>
  );
}

export function LeadToolLoadingShell({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-6 animate-fade-in" aria-busy="true" aria-live="polite">
      <LeadToolHeader eyebrow={eyebrow} title={title} description={description} action={<BatteryLoadingPill />} />

      <div className="rounded-2xl border border-(--rs-primary-100) bg-linear-to-br from-(--rs-primary-50) via-white to-(--rs-accent-50) p-5 shadow-sm animate-lead-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-(--rs-primary-700)">
              Loading briefing
            </p>
            <p className="text-sm text-(--rs-neutral-grey-600)">
              Pulling yesterday&apos;s people, pipeline, recruiting, and report signals.
            </p>
          </div>
          <BatteryMeter />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-4 shadow-sm animate-lead-card"
            style={{ animationDelay: `${index * 70}ms` }}
          >
            <Skeleton className="h-3 w-24 rounded-full" />
            <Skeleton className="mt-3 h-7 w-20 rounded-lg" />
            <Skeleton className="mt-2 h-3 w-28 rounded-full" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-5 shadow-sm animate-lead-card [animation-delay:120ms]">
        <Skeleton className="h-3 w-28 rounded-full" />
        <Skeleton className="mt-4 h-5 w-full rounded-lg" />
        <Skeleton className="mt-2 h-5 w-[92%] rounded-lg" />
        <Skeleton className="mt-2 h-5 w-[78%] rounded-lg" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-5 shadow-sm animate-lead-card"
            style={{ animationDelay: `${180 + index * 70}ms` }}
          >
            <Skeleton className="h-3 w-24 rounded-full" />
            <div className="mt-4 space-y-3">
              <Skeleton className="h-4 w-2/3 rounded-lg" />
              <Skeleton className="h-4 w-full rounded-lg" />
              <Skeleton className="h-4 w-[88%] rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BatteryLoadingPill() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-(--rs-primary-100) bg-white/90 px-3 py-1.5 text-xs font-semibold text-(--rs-primary-700) shadow-sm backdrop-blur-sm">
      <span className="relative flex h-3.5 w-8 items-center rounded-full border border-(--rs-primary-200) bg-(--rs-primary-50) px-[2px]">
        <span className="absolute -right-[3px] h-1.5 w-1 rounded-r-full bg-(--rs-primary-200)" />
        <span className="h-2 w-[65%] rounded-full bg-linear-to-r from-(--rs-primary-400) via-(--rs-primary-500) to-(--rs-accent-400) animate-battery-charge" />
      </span>
      Syncing signals
    </div>
  );
}

function BatteryMeter() {
  return (
    <div className="min-w-[220px] rounded-2xl border border-(--rs-primary-100) bg-white/90 p-4 shadow-sm">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-(--rs-neutral-grey-500)">
        <span>Charge</span>
        <span className="text-(--rs-primary-700)">Streaming</span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="relative h-8 flex-1 rounded-xl border border-(--rs-primary-200) bg-(--rs-neutral-grey-100) p-1">
          <div className="absolute -right-2 top-1/2 h-4 w-1.5 -translate-y-1/2 rounded-r-full bg-(--rs-primary-200)" />
          <div className="h-full w-full overflow-hidden rounded-lg bg-linear-to-r from-(--rs-primary-500) via-(--rs-primary-400) to-(--rs-accent-400)">
            <div className="h-full w-2/5 rounded-r-2xl bg-white/35 animate-battery-scan" />
          </div>
        </div>
        <span className="text-lg font-bold tabular-nums text-(--rs-primary-700)">82%</span>
      </div>
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("bg-(--rs-neutral-grey-100) animate-skeleton-wave", className)} />;
}
