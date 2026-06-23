import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { canAccessAdmin } from '@/lib/rbac';
import { createAdminClient } from '@/lib/supabase/admin';
import { UsersAdminTabs } from '@/components/users-admin-tabs';

export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session || !canAccessAdmin(session.role)) redirect('/dashboard');

  const admin = createAdminClient();
  const { data } = await admin
    .from('users')
    .select('id, username, name, email, role, team, job_title, member_code, hourly_rate_usd, is_active, tool_access, date_of_birth, start_date, end_date, drive_url')
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
    toolAccess:    Array.isArray(u.tool_access) ? (u.tool_access as string[]) : [],
    dateOfBirth:   (u.date_of_birth as string | null) ?? null,
    startDate:     (u.start_date as string | null) ?? null,
    endDate:       (u.end_date as string | null) ?? null,
    driveUrl:      (u.drive_url as string | null) ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">User Management</h1>
        <p className="text-sm text-(--rs-neutral-grey-500) mt-1">
          Manage team accounts, roles, and per-user settings.
        </p>
      </div>

      <UsersAdminTabs initialUsers={allUsers} currentUserId={session.id} />
    </div>
  );
}
