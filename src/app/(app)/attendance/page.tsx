import { getSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { AttendanceClient } from './attendance-client';

export const dynamic = 'force-dynamic';

// Open to every signed-in user. The data behind it (GET /api/attendance) is
// scoped server-side: admins see everyone, everyone else sees themselves plus
// everyone below them in the reporting chain.
export default async function AttendancePage() {
  const session = await getSession();
  if (!session) redirect('/login');
  return <AttendanceClient isAdmin={session.role === 'admin'} />;
}
