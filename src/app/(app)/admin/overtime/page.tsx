import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { canAccessAdmin } from '@/lib/rbac';
import { OvertimeRequestsClient } from './overtime-requests-client';

export default async function AdminOvertimePage() {
  const session = await getSession();
  if (!session || !canAccessAdmin(session.role)) redirect('/dashboard');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900) leading-tight">
          Overtime Requests
        </h1>
        <p className="text-sm text-(--rs-neutral-grey-500) mt-1 max-w-2xl">
          Contractors are auto-clocked-out at the 15-hour weekly limit — there is no per-day cap.
          Approving a request grants overtime for the rest of today (Asia/Manila) and lets them
          clock back in; the limit resumes automatically after it expires.
        </p>
      </div>
      <OvertimeRequestsClient />
    </div>
  );
}
