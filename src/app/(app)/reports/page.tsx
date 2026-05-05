import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { normalizeRole, canAccessReports } from '@/lib/rbac';
import { GenerateReportButton } from '@/components/generate-report-button';
import { ReportsManagementPanel } from '@/components/reports-management-panel';
import { MyReportButton } from '@/components/my-report-button';

async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload?.id) return null;
  const [user] = await db.select().from(users).where(eq(users.id, Number(payload.id)));
  return user ?? null;
}

export default async function ReportsPage() {
  const sessionUser = await getSessionUser();
  const role = normalizeRole(sessionUser?.role);
  const isLeadOrAdmin = canAccessReports(role);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">Weekly Reports</h1>
          <p className="text-sm text-(--rs-neutral-grey-500)">
            {isLeadOrAdmin
              ? 'Generate reports, download existing files, and inspect Plane workspace users.'
              : 'Download your weekly activity report from Plane.'}
          </p>
        </div>
        {isLeadOrAdmin && <GenerateReportButton />}
      </div>

      {isLeadOrAdmin ? (
        <ReportsManagementPanel />
      ) : (
        <MyReportButton
          planeMemberId={sessionUser?.planeMemberId ?? null}
          memberName={sessionUser?.name ?? 'Unknown'}
        />
      )}
    </div>
  );
}
