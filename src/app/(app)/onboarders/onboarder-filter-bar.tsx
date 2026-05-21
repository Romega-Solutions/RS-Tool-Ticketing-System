'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { Search, Filter, Tag, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ALLOWED_STATUSES, ALLOWED_TYPES, type OnboarderStatus, type OnboarderType } from './constants';
import { STATUS_LABEL } from './onboarder-row';

const TYPE_LABEL: Record<OnboarderType, string> = {
  contractor: 'Contractor',
  intern:     'Intern',
};

const OPT_STYLE: React.CSSProperties = { backgroundColor: '#fff', color: '#0f172a' };

export function OnboarderFilterBar({
  q, statusFilter, typeFilter, totalShown, totalAll,
}: {
  q:            string;
  statusFilter: string;
  typeFilter:   string;
  totalShown:   number;
  totalAll:     number;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);

  // Auto-submit on filter change → URL updates → server re-renders with filtered list.
  // Search input stays manual (debouncing would need state); user hits Enter or Apply.
  const submit = () => formRef.current?.requestSubmit();

  return (
    <form ref={formRef} className="border-b border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px_180px_auto]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--rs-neutral-grey-400)" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name, email, role, team, supervisor"
            aria-label="Search onboarders"
            className="w-full rounded-lg border border-(--rs-neutral-grey-200) bg-white py-2 pl-9 pr-3 text-sm text-(--rs-neutral-grey-900) outline-none transition-colors focus:border-(--rs-primary-300) focus:ring-3 focus:ring-(--rs-primary-100)"
          />
        </label>

        <label className="relative block">
          <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--rs-neutral-grey-400)" />
          <select
            name="status"
            defaultValue={statusFilter}
            onChange={submit}
            aria-label="Filter by stage"
            className="appearance-none w-full rounded-lg border border-(--rs-neutral-grey-200) bg-white py-2 pl-9 pr-9 text-sm text-(--rs-neutral-grey-900) outline-none transition-colors focus:border-(--rs-primary-300) focus:ring-3 focus:ring-(--rs-primary-100) cursor-pointer"
          >
            <option value="all" style={OPT_STYLE}>All stages</option>
            {ALLOWED_STATUSES.map((s: OnboarderStatus) => (
              <option key={s} value={s} style={OPT_STYLE}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--rs-neutral-grey-400)" />
        </label>

        <label className="relative block">
          <Tag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--rs-neutral-grey-400)" />
          <select
            name="type"
            defaultValue={typeFilter}
            onChange={submit}
            aria-label="Filter by type"
            className="appearance-none w-full rounded-lg border border-(--rs-neutral-grey-200) bg-white py-2 pl-9 pr-9 text-sm text-(--rs-neutral-grey-900) outline-none transition-colors focus:border-(--rs-primary-300) focus:ring-3 focus:ring-(--rs-primary-100) cursor-pointer"
          >
            <option value="all" style={OPT_STYLE}>All types</option>
            {ALLOWED_TYPES.map((t: OnboarderType) => (
              <option key={t} value={t} style={OPT_STYLE}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--rs-neutral-grey-400)" />
        </label>

        <div className="flex gap-2">
          <Button type="submit" className="rounded-lg bg-(--rs-primary-500) px-4 py-2 text-sm font-semibold text-white hover:bg-(--rs-primary-600)">
            Apply
          </Button>
          <Link
            href="/onboarders"
            className="rounded-lg border border-(--rs-neutral-grey-200) bg-white px-4 py-2 text-sm font-semibold text-(--rs-neutral-grey-700) hover:bg-(--rs-neutral-grey-100) transition-colors"
          >
            Reset
          </Link>
        </div>
      </div>
      <p className="mt-3 text-xs text-(--rs-neutral-grey-500)">
        Showing {totalShown} of {totalAll} onboarder{totalAll === 1 ? '' : 's'}. Stage and type filters apply instantly.
      </p>
    </form>
  );
}
