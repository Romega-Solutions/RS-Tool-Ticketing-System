import { redirect } from 'next/navigation';
import { BellRing } from 'lucide-react';
import { getSession } from '@/lib/session';
import { canAccessAdmin } from '@/lib/rbac';
import { createAdminClient } from '@/lib/supabase/admin';

type PresencePingRow = {
  id: string;
  from_name: string;
  to_user_id: number;
  message: string;
  response_message: string | null;
  status: string;
  created_at: string;
  deadline_at: string;
  acknowledged_at: string | null;
  missed_at: string | null;
};

function fmt(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function statusClass(status: string): string {
  if (status === 'acknowledged') return 'bg-green-50 text-green-700 border-green-200';
  if (status === 'missed') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

export default async function AdminPresencePingsPage() {
  const session = await getSession();
  if (!session || !canAccessAdmin(session.role)) redirect('/dashboard');

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('presence_pings')
    .select('id, from_name, to_user_id, message, response_message, status, created_at, deadline_at, acknowledged_at, missed_at')
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = (data ?? []) as PresencePingRow[];
  const toUserIds = [...new Set(rows.map(row => row.to_user_id))];
  const { data: toUsers } = toUserIds.length > 0
    ? await admin.from('users').select('id, name').in('id', toUserIds)
    : { data: [] };
  const toNameById = new Map(
    ((toUsers ?? []) as Array<{ id: number; name: string }>).map(user => [user.id, user.name]),
  );
  const missingTable = error?.message?.toLowerCase().includes('presence_pings')
    && error.message.toLowerCase().includes('does not exist');

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <span className="mt-1 flex h-9 w-9 items-center justify-center rounded-md bg-(--rs-primary-50) text-(--rs-primary-700)">
          <BellRing className="h-4 w-4" />
        </span>
        <div>
          <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">Ping Records</h1>
          <p className="mt-1 max-w-2xl text-sm text-(--rs-neutral-grey-500)">
            Review live ping accountability: pending replies, replies received, and missed 1-hour windows.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {missingTable
            ? 'Presence ping history table is not applied yet. Run docs/migrations/add-presence-pings.sql in Supabase.'
            : `Could not load ping records: ${error.message}`}
        </div>
      )}

      {!error && rows.length === 0 && (
        <div className="rounded-lg border border-(--rs-neutral-grey-200) bg-white px-4 py-8 text-center text-sm text-(--rs-neutral-grey-500)">
          No ping records yet.
        </div>
      )}

      {!error && rows.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-(--rs-neutral-grey-200) bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) text-xs uppercase text-(--rs-neutral-grey-500)">
                <tr>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">From</th>
                  <th className="px-4 py-3 font-semibold">To User</th>
                  <th className="px-4 py-3 font-semibold">Message</th>
                  <th className="px-4 py-3 font-semibold">Reply</th>
                  <th className="px-4 py-3 font-semibold">Sent</th>
                  <th className="px-4 py-3 font-semibold">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--rs-neutral-grey-100)">
                {rows.map(row => (
                  <tr key={row.id} className="align-top">
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-(--rs-neutral-grey-900)">{row.from_name}</td>
                    <td className="px-4 py-3 text-(--rs-neutral-grey-600)">
                      {toNameById.get(row.to_user_id) ?? `#${row.to_user_id}`}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-(--rs-neutral-grey-700)">{row.message}</td>
                    <td className="max-w-xs px-4 py-3 text-(--rs-neutral-grey-700)">
                      {row.response_message ?? (row.status === 'missed' ? 'No reply' : '-')}
                    </td>
                    <td className="px-4 py-3 text-(--rs-neutral-grey-500)">{fmt(row.created_at)}</td>
                    <td className="px-4 py-3 text-(--rs-neutral-grey-500)">{fmt(row.deadline_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
