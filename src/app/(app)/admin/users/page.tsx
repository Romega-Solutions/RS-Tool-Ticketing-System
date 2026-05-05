import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { canAccessAdmin } from '@/lib/rbac';
import { db } from '@/db';
import { users } from '@/db/schema';
import { UserManagementTable } from '@/components/user-management-table';

export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session || !canAccessAdmin(session.role)) redirect('/dashboard');

  const allUsers = await db
    .select({
      id:            users.id,
      username:      users.username,
      name:          users.name,
      email:         users.email,
      role:          users.role,
      team:          users.team,
      jobTitle:      users.jobTitle,
      planeMemberId: users.planeMemberId,
      isActive:      users.isActive,
    })
    .from(users)
    .orderBy(users.name);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">User Management</h1>
        <p className="text-sm text-(--rs-neutral-grey-500) mt-1">
          Manage team accounts, roles, and Plane member IDs.
        </p>
      </div>

      <UserManagementTable initialUsers={allUsers} />
    </div>
  );
}
