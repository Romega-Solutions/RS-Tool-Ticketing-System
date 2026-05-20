import { getSession } from '@/lib/session';
import { canAccessReports } from '@/lib/rbac';
import { GenerateReportButton } from '@/components/generate-report-button';
import { ReportsManagementPanel } from '@/components/reports-management-panel';
import { MyReportButton } from '@/components/my-report-button';

export default async function ReportsPage() {
  const sessionUser = await getSession();
  const role = sessionUser?.role ?? 'ic';
  const isLeadOrAdmin = canAccessReports(role);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">Weekly Reports</h1>
          <p className="text-sm text-(--rs-neutral-grey-500)">
            {isLeadOrAdmin
              ? 'Generate reports, download existing files, and inspect workspace members.'
              : 'Download your weekly activity report from Plane.'}
          </p>
        </div>
        {isLeadOrAdmin && <GenerateReportButton />}
      </div>

      {isLeadOrAdmin ? (
        <ReportsManagementPanel />
      ) : (
        <MyReportButton memberName={sessionUser?.name ?? 'Unknown'} />
      )}
    </div>
  );
}
