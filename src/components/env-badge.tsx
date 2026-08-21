const ENV_STYLES: Record<string, { label: string; className: string }> = {
  staging: {
    label: 'Staging',
    className: 'bg-(--rs-accent-100) text-(--rs-accent-800)',
  },
  development: {
    label: 'Dev',
    className: 'bg-(--rs-neutral-grey-200) text-(--rs-neutral-grey-700)',
  },
};

export function EnvBadge() {
  const appEnv = process.env.NEXT_PUBLIC_APP_ENV || (process.env.NODE_ENV === 'development' ? 'development' : '');
  const env = ENV_STYLES[appEnv];
  if (!env) return null;

  return (
    <span
      className={`hidden sm:inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest select-none ${env.className}`}
    >
      {env.label}
    </span>
  );
}