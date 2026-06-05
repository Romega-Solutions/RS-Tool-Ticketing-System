'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Users2, Briefcase, Workflow, Star } from 'lucide-react';

const TABS = [
  { href: '/recruiting/candidates',   label: 'Candidates',   icon: Users2 },
  { href: '/recruiting/positions',    label: 'Positions',    icon: Briefcase },
  { href: '/recruiting/talent-pool',  label: 'Talent Pool',  icon: Star },
  { href: '/recruiting/automations',  label: 'Automations',  icon: Workflow },
] as const;

export function AtsTabs() {
  const pathname = usePathname() ?? '';
  return (
    <div className="border-b border-(--rs-neutral-grey-200)">
      <nav className="-mb-px flex gap-6" aria-label="ATS sections">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`group inline-flex items-center gap-2 border-b-2 px-1 pb-3 pt-1 text-sm font-semibold transition-colors ${
                active
                  ? 'border-(--rs-primary-500) text-(--rs-primary-700)'
                  : 'border-transparent text-(--rs-neutral-grey-500) hover:border-(--rs-neutral-grey-300) hover:text-(--rs-neutral-grey-700)'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className={`w-4 h-4 ${active ? 'text-(--rs-primary-600)' : 'text-(--rs-neutral-grey-400) group-hover:text-(--rs-neutral-grey-600)'}`} />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
