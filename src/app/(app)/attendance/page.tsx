import { getSession } from '@/lib/session';
import { hasToolAccess, defaultLandingPath } from '@/lib/rbac';
import { redirect } from 'next/navigation';
import { AttendanceClient } from './attendance-client';

export default async function AttendancePage() {
  const session = await getSession();
  if (!session || !hasToolAccess('attendance', session.role, session.toolAccess)) {
    redirect(defaultLandingPath(session?.role ?? 'ic'));
  }
  return <AttendanceClient isAdmin={session.role === 'admin'} />;
}
