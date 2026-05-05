import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import { normalizeRole, canAccessAdmin } from '@/lib/rbac';
import { db } from '@/db';
import { users } from '@/db/schema';
import { UserManagementTable } from '@/components/user-management-table';

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload?.id) return null;
  if (!canAccessAdmin(normalizeRole(payload.role))) return null;
  return true;
}

export default async function AdminUsersPage() {
  const ok = await requireAdmin();
  if (!ok) redirect('/dashboard');

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
          Manage team accounts, roles, and Plane member IDs. Click Edit on a row to make changes.
        </p>
      </div>

      <UserManagementTable initialUsers={allUsers} />
    </div>
  );
}
