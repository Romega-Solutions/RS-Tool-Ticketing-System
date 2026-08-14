import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card, CardContent } from '@/components/ui/card';
import { Star, Globe, ShieldCheck, Clock, AlertCircle, Search, Filter, MapPin } from 'lucide-react';
import { LeadToolHeader, StatCard } from '@/components/lead-tool-header';
import { getSession } from '@/lib/session';
import { hasToolAccess } from '@/lib/rbac';
import { CandidateForm } from '../candidates/candidate-form';
import { AtsTabs } from '../ats-tabs';
import { ConsentChip, TalentPoolActions, type ConsentStatus } from './talent-pool-row';

type Row = {
  id: number;
  full_name: string;
  email: string | null;
  position: string | null;
  location: string | null;
  is_public_talent: boolean | null;
  consent_status: string | null;
  consent_requested_at: string | null;
  consent_agreed_at: string | null;
  consent_method: string | null;
};

type PositionOptionRow = {
  id: number;
  job_title: string;
};

const FILTERS = ['all', 'published', 'agreed', 'requested', 'none'] as const;
type FilterKey = typeof FILTERS[number];
const FILTER_LABEL: Record<FilterKey, string> = {
  all: 'Everyone',
  published: 'Published',
  agreed: 'Consent agreed',
  requested: 'Awaiting consent',
  none: 'Not requested',
};

function isTableMissing(msg: string | undefined) {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return m.includes('relation') && m.includes('does not exist');
}

function normStatus(s: string | null): ConsentStatus {
  return (s === 'requested' || s === 'agreed' || s === 'revoked') ? s : 'none';
}

type PageProps = { searchParams: Promise<{ q?: string; filter?: string }> };

export default async function TalentPoolPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session || !hasToolAccess('recruiting', session.role, session.toolAccess)) {
    redirect('/dashboard');
  }

  const { q = '', filter = 'all' } = await searchParams;
  const query = q.trim().toLowerCase();
  const activeFilter: FilterKey = FILTERS.includes(filter as FilterKey) ? (filter as FilterKey) : 'all';

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('candidates')
    .select('id, full_name, email, position, location, is_public_talent, consent_status, consent_requested_at, consent_agreed_at, consent_method')
    .order('is_public_talent', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(300);
  const { data: positionData } = await supabase
    .from('positions')
    .select('id, job_title')
    .eq('is_open', true)
    .order('job_title', { ascending: true })
    .limit(200);
  const positions = ((positionData ?? []) as PositionOptionRow[])
    .filter(position => Number.isInteger(position.id) && position.job_title.trim())
    .map(position => ({ id: Number(position.id), jobTitle: position.job_title }));

  const errorMsg = error?.message;
  const tableMissing = isTableMissing(errorMsg) || (errorMsg?.toLowerCase().includes('consent_status') ?? false);
  const unexpectedError = error && !tableMissing ? errorMsg : null;
  const all: Row[] = (data as Row[] | null) ?? [];

  const publishedCount = all.filter(r => r.is_public_talent).length;
  const agreedCount    = all.filter(r => normStatus(r.consent_status) === 'agreed' && !r.is_public_talent).length;
  const requestedCount = all.filter(r => normStatus(r.consent_status) === 'requested').length;

  const rows = all.filter(r => {
    const cs = normStatus(r.consent_status);
    const matchesQuery = !query || [r.full_name, r.email ?? '', r.position ?? '', r.location ?? ''].some(v => v.toLowerCase().includes(query));
    const matchesFilter =
      activeFilter === 'all' ? true :
      activeFilter === 'published' ? !!r.is_public_talent :
      activeFilter === 'agreed' ? cs === 'agreed' :
      activeFilter === 'requested' ? cs === 'requested' :
      cs === 'none';
    return matchesQuery && matchesFilter;
  });

  return (
    <div className="space-y-6">
      <LeadToolHeader
        eyebrow="Recruiting tool"
        title="Talent Pool"
        description="Manage who appears on the public talent showcase at romega-solutions.com/talent. Publishing requires recorded candidate consent (GDPR) — send a consent email or mark agreed if you hold written proof, then publish. Public cards are anonymized to first name + last initial."
        action={<CandidateForm positions={positions} />}
      />

      <AtsTabs />

      {tableMissing && (
        <Card>
          <CardContent className="p-6 space-y-3">
            <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">Setup required</h2>
            <p className="text-sm text-(--rs-neutral-grey-600)">
              The talent-pool consent columns haven&apos;t been added yet. Run{' '}
              <code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-xs">docs/migrations/add-candidates-talent-consent.sql</code> in Supabase.
            </p>
          </CardContent>
        </Card>
      )}

      {unexpectedError && (
        <Card>
          <CardContent className="p-6 space-y-2">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="w-4 h-4" />
              <h2 className="font-serif text-base font-bold">Couldn&apos;t load the talent pool</h2>
            </div>
            <p className="text-sm text-(--rs-neutral-grey-600)">{unexpectedError}</p>
          </CardContent>
        </Card>
      )}

      {!tableMissing && !unexpectedError && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={<Globe className="w-4 h-4" />}       label="Published"       value={String(publishedCount)} accent hint="live on /talent" />
            <StatCard icon={<ShieldCheck className="w-4 h-4" />} label="Consent agreed"  value={String(agreedCount)}    hint="ready to publish" />
            <StatCard icon={<Clock className="w-4 h-4" />}       label="Awaiting consent" value={String(requestedCount)} hint="email sent" />
            <StatCard icon={<Star className="w-4 h-4" />}        label="Candidates"      value={String(all.length)}     hint="eligible to add" />
          </div>

          <Card>
            <CardContent className="p-0">
              <form className="border-b border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) p-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px]">
                  <label className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--rs-neutral-grey-400)" />
                    <input
                      name="q"
                      defaultValue={q}
                      placeholder="Search name, role, email, or location"
                      className="w-full rounded-lg border border-(--rs-neutral-grey-200) bg-white py-2 pl-9 pr-3 text-sm text-(--rs-neutral-grey-900) outline-none transition-colors focus:border-(--rs-primary-300) focus:ring-3 focus:ring-(--rs-primary-100)"
                    />
                  </label>
                  <label className="relative">
                    <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--rs-neutral-grey-400)" />
                    <select
                      name="filter"
                      defaultValue={activeFilter}
                      className="w-full rounded-lg border border-(--rs-neutral-grey-200) bg-white py-2 pl-9 pr-3 text-sm text-(--rs-neutral-grey-900) outline-none transition-colors focus:border-(--rs-primary-300) focus:ring-3 focus:ring-(--rs-primary-100)"
                    >
                      {FILTERS.map(f => <option key={f} value={f}>{FILTER_LABEL[f]}</option>)}
                    </select>
                  </label>
                </div>
              </form>

              {rows.length === 0 ? (
                <div className="p-10 text-center text-sm text-(--rs-neutral-grey-500)">
                  No candidates match. Add candidates from the <strong>Candidates</strong> tab, then send a consent request here.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-(--rs-neutral-grey-200) text-left text-[11px] uppercase tracking-wider text-(--rs-neutral-grey-500)">
                        <th className="px-4 py-2.5 font-semibold">Candidate</th>
                        <th className="px-4 py-2.5 font-semibold">Role · Location</th>
                        <th className="px-4 py-2.5 font-semibold">Consent</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Manage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.id} className="border-b border-(--rs-neutral-grey-100) last:border-0 hover:bg-(--rs-neutral-grey-50)/60">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <a href={`/recruiting/candidates/${r.id}`} className="font-medium text-(--rs-neutral-grey-900) hover:text-(--rs-primary-700)">
                                {r.full_name}
                              </a>
                              {r.is_public_talent && (
                                <span className="inline-flex items-center gap-1 rounded-md border border-green-300 bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                                  <Globe className="w-2.5 h-2.5" /> Public
                                </span>
                              )}
                            </div>
                            {r.email && <div className="text-xs text-(--rs-neutral-grey-400)">{r.email}</div>}
                          </td>
                          <td className="px-4 py-3 text-(--rs-neutral-grey-700)">
                            <div>{r.position || <span className="text-(--rs-neutral-grey-400)">—</span>}</div>
                            {r.location && (
                              <div className="flex items-center gap-1 text-xs text-(--rs-neutral-grey-400)">
                                <MapPin className="w-3 h-3" /> {r.location}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <ConsentChip
                              status={normStatus(r.consent_status)}
                              requestedAt={r.consent_requested_at}
                              agreedAt={r.consent_agreed_at}
                              method={r.consent_method}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <TalentPoolActions
                              id={r.id}
                              email={r.email}
                              isPublic={!!r.is_public_talent}
                              consentStatus={normStatus(r.consent_status)}
                            />
                          </td>
                        </tr>
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
