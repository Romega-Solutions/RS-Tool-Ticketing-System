import { getSession } from '@/lib/session';
import { canAccessReports } from '@/lib/rbac';
import { FileText } from 'lucide-react';
import { WeeklyReportForm } from '@/components/weekly-report-form';
import { CeoReportsOverview } from '@/components/ceo-reports-overview';
import { ExcelExportPanel } from '@/components/weekly-report-export';
import { TabSwitcher } from '@/components/weekly-report-tabs';

export default async function WeeklyReportPage() {
  const sessionUser = await getSession();
  const role = sessionUser?.role ?? 'ic';
  const isLeadOrAdmin = canAccessReports(role);
  const isAdmin = role === 'admin';

  const subtitle = isAdmin
    ? 'Org-wide weekly reports — submissions, escalations, and Excel exports for every team.'
    : isLeadOrAdmin
    ? 'Submit your weekly report, review your team’s submissions, and export to Excel.'
    : 'Submit your weekly status and download your report as Excel.';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--rs-primary-50) text-(--rs-primary-600)">
          <FileText className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">Weekly Reports</h1>
          <p className="text-sm text-(--rs-neutral-grey-500) mt-0.5">{subtitle}</p>
        </div>
      </div>

      <TabSwitcher
        role={role}
        myReportSlot={
          !isAdmin ? (
            <div className="space-y-5">
              <ExcelExportPanel variant="self" memberName={sessionUser?.name ?? 'Unknown'} />
              <WeeklyReportForm />
            </div>
          ) : null
        }
        teamSlot={null}
        overviewSlot={
          isLeadOrAdmin ? (
            <div className="space-y-6">
              <ExcelExportPanel variant="member" />
              <CeoReportsOverview />
            </div>
          ) : null
        }
        overviewLabel={isAdmin ? 'All Teams' : 'Team Overview'}
      />
    </div>
  );
}
