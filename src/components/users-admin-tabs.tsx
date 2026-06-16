'use client';

import { useState } from 'react';
import { UserManagementTable, type UserRow } from '@/components/user-management-table';
import { UserActivityPanel } from '@/components/user-activity-panel';

const TABS = [
  ['manage', 'Add & Remove Users'],
  ['activity', 'Activity'],
] as const;

type TabKey = (typeof TABS)[number][0];

export function UsersAdminTabs({ initialUsers, currentUserId }: { initialUsers: UserRow[]; currentUserId: number }) {
  const [tab, setTab] = useState<TabKey>('manage');

  return (
    <div className="space-y-6">
      <div className="flex gap-0.5 border-b border-(--rs-neutral-grey-200)">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors rounded-t focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--rs-primary-300) ${
              tab === key
                ? 'border-(--rs-primary-500) text-(--rs-primary-600)'
                : 'border-transparent text-(--rs-neutral-grey-500) hover:text-(--rs-neutral-grey-700) hover:border-(--rs-neutral-grey-300)'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'manage'
        ? <UserManagementTable initialUsers={initialUsers} currentUserId={currentUserId} />
        : <UserActivityPanel />}
    </div>
  );
}
