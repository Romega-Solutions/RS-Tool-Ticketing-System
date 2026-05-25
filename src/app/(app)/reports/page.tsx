import { getSession } from '@/lib/session';
import { canAccessReports } from '@/lib/rbac';
import { GenerateReportButton } from '@/components/generate-report-button';
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
              ? 'Generate weekly activity reports for the team. Files download immediately — no past-reports archive yet.'
              : 'Download your weekly activity report.'}
          </p>
        </div>
        {isLeadOrAdmin && <GenerateReportButton />}
      </div>

      {!isLeadOrAdmin && <MyReportButton memberName={sessionUser?.name ?? 'Unknown'} />}
    </div>
  );
}
