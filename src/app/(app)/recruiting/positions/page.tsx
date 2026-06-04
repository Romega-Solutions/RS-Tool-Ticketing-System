import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card, CardContent } from '@/components/ui/card';
import { Briefcase, AlertCircle } from 'lucide-react';
import { LeadToolHeader, StatCard } from '@/components/lead-tool-header';
import { getSession } from '@/lib/session';
import { canAccessLeadTool } from '@/lib/rbac';
import { AtsTabs } from '../ats-tabs';
import { PositionForm } from './position-form';
import { PositionTableRow, type Position } from './position-table-row';

function isTableMissing(msg: string | undefined) {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return m.includes('relation') && m.includes('does not exist');
}

export default async function PositionsPage() {
  const session = await getSession();
  if (!session || !canAccessLeadTool('recruiting', session.role, session.team)) {
    redirect('/dashboard');
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('positions')
    .select('id, job_title, client, location, job_description, is_open, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  const errorMsg = error?.message;
  const tableMissing = isTableMissing(errorMsg);
  const unexpectedError = error && !tableMissing ? errorMsg : null;
  const positions: Position[] = (data as Position[] | null) ?? [];

  const openCount   = positions.filter(p => p.is_open).length;
  const closedCount = positions.length - openCount;

  return (
    <div className="space-y-6">
      <LeadToolHeader
        eyebrow="Recruiting tool"
        title="Applicant Tracking System"
        description="Track open roles you're hiring for. Candidates in the Candidates tab can be tied to a Position when you set their 'Applying for' field."
        action={
          !tableMissing && !unexpectedError ? <PositionForm /> : null
        }
      />

      <AtsTabs />

      {tableMissing && (
        <Card>
          <CardContent className="p-6 space-y-3">
            <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">Setup required</h2>
            <p className="text-sm text-(--rs-neutral-grey-600)">
              The <code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-xs">positions</code> table
              hasn&apos;t been created yet. Run this in Supabase SQL Editor:
            </p>
            <ol className="list-decimal text-sm text-(--rs-neutral-grey-700) ml-5 space-y-1">
              <li><code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-xs">docs/migrations/add-ats-history-and-positions.sql</code></li>
            </ol>
          </CardContent>
        </Card>
      )}

      {unexpectedError && (
        <Card>
          <CardContent className="p-6 space-y-2">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="w-4 h-4" />
              <h2 className="font-serif text-base font-bold">Couldn&apos;t load positions</h2>
            </div>
            <p className="text-sm text-(--rs-neutral-grey-600)">{unexpectedError}</p>
          </CardContent>
        </Card>
      )}

      {!tableMissing && !unexpectedError && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard icon={<Briefcase className="w-4 h-4" />} label="Open positions"   value={String(openCount)}   hint="actively hiring" />
            <StatCard icon={<Briefcase className="w-4 h-4" />} label="Closed positions" value={String(closedCount)} hint="filled or paused" />
            <StatCard icon={<Briefcase className="w-4 h-4" />} label="Total"            value={String(positions.length)} accent hint="all-time" />
          </div>

          <Card>
            <CardContent className="p-0">
              {positions.length === 0 ? (
                <div className="px-6 py-20 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-(--rs-primary-50) flex items-center justify-center mb-3">
                    <Briefcase className="w-6 h-6 text-(--rs-primary-500)" />
                  </div>
                  <p className="text-sm font-semibold text-(--rs-neutral-grey-900)">No positions yet</p>
                  <p className="text-sm text-(--rs-neutral-grey-500) mt-1 max-w-sm mx-auto">
                    Click <strong>Add position</strong> to track an open role.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-(--rs-neutral-grey-200) text-left text-xs uppercase tracking-wider text-(--rs-neutral-grey-500) bg-(--rs-neutral-grey-50)">
                      <tr>
                        <th className="px-6 py-3 font-semibold">Job title</th>
                        <th className="px-4 py-3 font-semibold">Client</th>
                        <th className="px-4 py-3 font-semibold">Location</th>
                        <th className="px-4 py-3 font-semibold">Opened</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-(--rs-neutral-grey-100)">
                      {positions.map(p => (
                        <PositionTableRow key={p.id} position={p} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
