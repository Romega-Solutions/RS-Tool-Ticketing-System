export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="w-full">
      <div className="h-2 w-full rounded-full bg-(--rs-neutral-grey-100) overflow-hidden">
        <div
          className="h-full bg-(--rs-primary-500) transition-all"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {label !== undefined && (
        <div className="mt-1 text-xs text-(--rs-neutral-grey-500)">{label}</div>
      )}
    </div>
  );
}
