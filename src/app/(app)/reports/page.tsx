import { GenerateReportButton } from '@/components/generate-report-button';
import { ReportsManagementPanel } from '@/components/reports-management-panel';
export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">Weekly Reports</h1>
          <p className="text-slate-600">Generate reports, download existing files, and inspect Plane workspace users.</p>
        </div>
        <GenerateReportButton />
      </div>

      <ReportsManagementPanel />
    </div>
  );
}
