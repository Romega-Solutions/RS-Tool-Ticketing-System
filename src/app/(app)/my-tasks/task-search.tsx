'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Search } from 'lucide-react';

// Debounced search box that keeps `?q=` in the URL; the server page does the filtering.
export function TaskSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get('q') ?? '');
  const [pending, startTransition] = useTransition();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const timeout = window.setTimeout(() => {
      const sp = new URLSearchParams(searchParams.toString());
      const q = value.trim();
      if (q) sp.set('q', q); else sp.delete('q');
      const qs = sp.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    }, 250);
    return () => window.clearTimeout(timeout);
    // Only re-run on typing; searchParams is read fresh when the timer fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative w-full sm:w-72">
      {pending ? (
        <Loader2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-(--rs-neutral-grey-400)" />
      ) : (
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--rs-neutral-grey-400)" />
      )}
      <input
        type="search"
        aria-label="Search my tasks"
        placeholder="Search by title, project, or ticket #…"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') setValue(''); }}
        className="min-h-10 w-full rounded-md border border-(--rs-neutral-grey-200) bg-white py-2 pl-8 pr-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-400)"
      />
    </div>
  );
}
