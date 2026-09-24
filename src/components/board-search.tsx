
'use client';

import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Search, X } from 'lucide-react';

/**
 * Search box for the project board. Typing updates ?q= in the URL (debounced),
 * and the server page filters the work items for every state column.
 *
 * Suggested location: src/components/board-search.tsx
 */
export function BoardSearch({
  placeholder = 'Search tasks in all states',
}: {
  placeholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get('q') ?? '';

  const [value, setValue] = useState(urlQuery);
  const [isPending, startTransition] = useTransition();

  // Push the typed value into the URL after a short pause.
  useEffect(() => {
    if (value.trim() === urlQuery.trim()) return;

    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const next = value.trim();
      if (next) params.set('q', next);
      else params.delete('q');

      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [value, urlQuery, searchParams, pathname, router]);

  return (
    <div className="relative w-full sm:max-w-sm">
      <label htmlFor="board-search" className="sr-only">
        Search tasks
      </label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--rs-neutral-grey-500)"
      />
      <input
        id="board-search"
        type="search"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') setValue('');
        }}
        placeholder={placeholder}
        autoComplete="off"
        className="min-h-10 w-full rounded-md border border-(--rs-neutral-grey-200) bg-white py-2 pl-9 pr-9 text-sm text-(--rs-neutral-grey-900) placeholder:text-(--rs-neutral-grey-500) transition-colors focus:border-(--rs-primary-300) focus:outline-none focus:ring-2 focus:ring-(--rs-primary-300)/40 [&::-webkit-search-cancel-button]:hidden"
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center">
        {isPending ? (
          <Loader2
            aria-label="Searching"
            className="h-4 w-4 animate-spin text-(--rs-neutral-grey-500)"
          />
        ) : value ? (
          <button
            type="button"
            onClick={() => setValue('')}
            aria-label="Clear search"
            className="rounded p-1 text-(--rs-neutral-grey-500) transition-colors hover:text-(--rs-neutral-grey-900)"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}