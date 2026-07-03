import { redirect } from 'next/navigation';
import { Megaphone } from 'lucide-react';
import { getSession } from '@/lib/session';
import { canAccessAdmin } from '@/lib/rbac';
import { createAdminClient } from '@/lib/supabase/admin';
import { BroadcastCenter } from './broadcast-center.client';
import type { BroadcastRecipient } from '@/lib/broadcasts';

export default async function AdminBroadcastsPage() {
  const session = await getSession();
  if (!session || !canAccessAdmin(session.role)) redirect('/dashboard');

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('users')
    .select('id, name, email, role, team, is_active')
    .order('name');

  const users = ((data ?? []) as Array<Record<string, unknown>>)
    .map((row): BroadcastRecipient => ({
      id: Number(row.id),
      name: String(row.name ?? 'Unnamed user'),
      email: typeof row.email === 'string' ? row.email : null,
      role: String(row.role ?? 'ic'),
      team: typeof row.team === 'string' ? row.team : null,
      isActive: Boolean(row.is_active),
    }))
    .filter(user => user.id !== session.id);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <span className="mt-1 flex h-9 w-9 items-center justify-center rounded-md bg-(--rs-primary-50) text-(--rs-primary-700)">
          <Megaphone className="h-4 w-4" />
        </span>
        <div>
          <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">Broadcasts</h1>
          <p className="mt-1 max-w-2xl text-sm text-(--rs-neutral-grey-500)">
            Send a custom announcement to team members through the app notification bell and the n8n email sender.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Could not load users: {error.message}
        </div>
      )}

      <BroadcastCenter users={users} />
    </div>
  );
}
