import { redirect } from 'next/navigation';
import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card, CardContent } from '@/components/ui/card';
import { Briefcase, AlertCircle } from 'lucide-react';
import { LeadToolHeader, StatCard } from '@/components/lead-tool-header';
import { getSession } from '@/lib/session';
import { hasToolAccess } from '@/lib/rbac';
import { AtsTabs } from '../ats-tabs';
import { PositionForm } from './position-form';
import { type Position } from './position-table-row';
import { PositionsTable } from './positions-table.client';
import { ATS_POSITIONS_TAG } from '@/lib/cache-tags';

function isTableMissing(msg: string | undefined) {
  if (!msg) return false;
  const m = msg.toLowerCase();
  // Catches both a missing `positions` table and a missing column (before the
  // extend-positions-fields migration has been applied) — both are fixed by the
  // SQL files listed in the setup card below.
  return m.includes('does not exist') && (m.includes('relation') || m.includes('column'));
}

const getCachedPositionRows = unstable_cache(
  async () => {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('positions')
      .select('id, job_title, placement_type, location, compensation, employment_type, openings, job_description, is_open, created_at, created_by')
      .order('created_at', { ascending: false })
      .limit(200);
    return { data: data as Position[] | null, errorMessage: error?.message ?? null };
  },
  ['ats-position-rows'],
  { revalidate: 300, tags: [ATS_POSITIONS_TAG] },
);

export default async function PositionsPage() {
  const session = await getSession();
  if (!session || !hasToolAccess('recruiting', session.role, session.toolAccess)) {
    redirect('/dashboard');
  }

  const supabase = createAdminClient();
  const { data, errorMessage } = await getCachedPositionRows();

  const errorMsg = errorMessage ?? undefined;
  const tableMissing = isTableMissing(errorMsg);
  const unexpectedError = errorMsg && !tableMissing ? errorMsg : null;
  const rawPositions = (data as Position[] | null) ?? [];

  // Resolve creator ids → names with a single lookup (same id→name map pattern
  // the candidates pages use).
  const creatorIds = [...new Set(rawPositions.map(p => p.created_by).filter((v): v is number => v != null))];
  const nameMap = new Map<number, string>();
  if (creatorIds.length) {
    const { data: users } = await supabase.from('users').select('id, name').in('id', creatorIds);
    for (const u of (users ?? []) as Array<{ id: number; name: string }>) {
      nameMap.set(Number(u.id), String(u.name));
    }
  }
  const positions: Position[] = rawPositions.map(p => ({
    ...p,
    created_by_name: p.created_by != null ? nameMap.get(Number(p.created_by)) ?? null : null,
  }));

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
              needs a database update. Run any you haven&apos;t yet, in order, in the Supabase SQL Editor:
            </p>
            <ol className="list-decimal text-sm text-(--rs-neutral-grey-700) ml-5 space-y-1">
              <li><code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-xs">docs/migrations/add-ats-history-and-positions.sql</code></li>
              <li><code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-xs">docs/migrations/extend-positions-fields.sql</code></li>
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

          <PositionsTable positions={positions} />
        </>
      )}
    </div>
  );
}
