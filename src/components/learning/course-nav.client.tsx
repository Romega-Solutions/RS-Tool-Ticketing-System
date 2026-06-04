'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Shared tab bar for a course's admin sub-pages with an active indicator, so
// it's always clear where you are when setting a course up. "Course" stays
// active across the course page and its lesson editors.
export function CourseNav({ courseId }: { courseId: number }) {
  const pathname = usePathname();
  const base = `/admin/learning/${courseId}`;
  const tabs = [
    { href: base,             label: 'Course' },
    { href: `${base}/assign`, label: 'Assign' },
    { href: `${base}/roster`, label: 'Roster' },
  ];

  function isActive(href: string): boolean {
    if (href === base) {
      return pathname === base || pathname.startsWith(`${base}/lessons`);
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav className="flex items-center gap-1 border-b border-(--rs-neutral-grey-200)">
      {tabs.map(t => {
        const active = isActive(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active
                ? 'border-(--rs-primary-500) text-(--rs-primary-600)'
                : 'border-transparent text-(--rs-neutral-grey-500) hover:text-(--rs-neutral-grey-800) hover:border-(--rs-neutral-grey-300)'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
