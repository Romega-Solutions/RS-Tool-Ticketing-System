import { getSession } from '@/lib/session';
import { canAccessReports } from '@/lib/rbac';
import { WeeklyReportForm } from '@/components/weekly-report-form';
import { TeamReportsView } from '@/components/team-reports-view';
import { CeoReportsOverview } from '@/components/ceo-reports-overview';
import { TabSwitcher } from '@/components/weekly-report-tabs';

export default async function WeeklyReportPage() {
  const sessionUser = await getSession();
  const role = sessionUser?.role ?? 'ic';
  const isLeadOrAdmin = canAccessReports(role);
  const isAdmin = role === 'admin';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold text-(--rs-neutral-grey-900)">Weekly Status Report</h1>
        <p className="text-sm text-(--rs-neutral-grey-500) mt-1">
          {isAdmin
            ? 'Org-wide report overview — all teams and escalations at a glance.'
            : isLeadOrAdmin
            ? 'Submit your weekly report and review your team\'s submissions.'
            : 'Submit your weekly status for your lead to review.'}
        </p>
      </div>

      <TabSwitcher
        role={role}
        myReportSlot={
          !isAdmin ? (
            <WeeklyReportForm planeMemberId={sessionUser?.planeMemberId ?? null} />
          ) : null
        }
        teamSlot={
          isLeadOrAdmin && !isAdmin ? <TeamReportsView /> : null
        }
        overviewSlot={
          isAdmin ? <CeoReportsOverview /> : null
        }
      />
    </div>
  );
}
