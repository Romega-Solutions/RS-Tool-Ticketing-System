import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { canAccessAdmin } from '@/lib/rbac';
import { createAdminClient } from '@/lib/supabase/admin';
import { UserManagementTable } from '@/components/user-management-table';

export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session || !canAccessAdmin(session.role)) redirect('/dashboard');

  const admin = createAdminClient();
  const { data } = await admin
    .from('users')
    .select('id, username, name, email, role, team, job_title, member_code, hourly_rate_usd, is_active')
    .order('name');
  const rawUsers = data ?? [];

  const allUsers = rawUsers.map((u: Record<string, unknown>) => ({
    id:            u.id as number,
    username:      u.username as string,
    name:          u.name as string,
    email:         u.email as string,
    role:          u.role as string,
    team:          u.team as string | null,
    jobTitle:      u.job_title as string | null,
    memberCode:    u.member_code as string | null,
    hourlyRateUsd: u.hourly_rate_usd == null ? null : Number(u.hourly_rate_usd),
    isActive:      Boolean(u.is_active),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">User Management</h1>
        <p className="text-sm text-(--rs-neutral-grey-500) mt-1">
          Manage team accounts, roles, and per-user settings.
        </p>
      </div>

      <UserManagementTable initialUsers={allUsers} />
    </div>
  );
}
