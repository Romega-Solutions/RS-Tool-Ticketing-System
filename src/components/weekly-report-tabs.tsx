'use client';

import { useState, type ReactNode } from 'react';
import type { AppRole } from '@/lib/rbac';

interface Props {
  role: AppRole;
  myReportSlot:  ReactNode;
  teamSlot:      ReactNode;
  overviewSlot:  ReactNode;
  overviewLabel?: string;
}

export function TabSwitcher({ role, myReportSlot, teamSlot, overviewSlot, overviewLabel }: Props) {
  const resolvedOverviewLabel = overviewLabel ?? (role === 'admin' ? 'All Teams' : 'Team Overview');
  const tabs = [];
  if (myReportSlot)  tabs.push({ key: 'my',       label: 'My Report'    });
  if (teamSlot)      tabs.push({ key: 'team',      label: 'Team Reports' });
  if (overviewSlot)  tabs.push({ key: 'overview',  label: resolvedOverviewLabel });

  const [active, setActive] = useState(tabs[0]?.key ?? 'my');

  if (tabs.length === 0) return null;

  // Single-tab: no tab bar needed
  if (tabs.length === 1) {
    if (myReportSlot)  return <>{myReportSlot}</>;
    if (teamSlot)      return <>{teamSlot}</>;
    if (overviewSlot)  return <>{overviewSlot}</>;
    return null;
  }

  return (
    <>
      <div className="flex gap-0.5 border-b border-(--rs-neutral-grey-200)">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active === tab.key
                ? 'border-(--rs-primary-500) text-(--rs-primary-600)'
                : 'border-transparent text-(--rs-neutral-grey-500) hover:text-(--rs-neutral-grey-700) hover:border-(--rs-neutral-grey-300)'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        {active === 'my'       && myReportSlot}
        {active === 'team'     && teamSlot}
        {active === 'overview' && overviewSlot}
      </div>
    </>
  );
}
