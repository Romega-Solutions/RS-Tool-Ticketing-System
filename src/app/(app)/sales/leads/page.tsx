import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Users, TrendingUp, Trophy, XCircle, AlertCircle, Search, Filter } from 'lucide-react';
import { LeadToolHeader, StatCard } from '@/components/lead-tool-header';
import { ToolResetButton } from '@/components/tool-reset-button';
import { getSession } from '@/lib/session';
import { canAccessLeadTool } from '@/lib/rbac';
import { LeadForm } from './lead-form';
import { LeadStage, LeadDelete } from './lead-row';
import { deleteAllLeads } from './actions';
import { SalesLeadExportButtons } from './sales-lead-export-buttons';

type LeadRowData = {
  id:         number;
  name:       string;
  email:      string | null;
  company:    string | null;
  stage:      string;
  value:      number;
  notes:      string | null;
  created_at: string;
};

const PHP = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
const LEAD_STAGE_OPTIONS = ['all', 'new', 'contacted', 'qualified', 'proposal', 'won', 'lost'] as const;

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }); }
  catch { return iso; }
}

function isTableMissing(msg: string | undefined) {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return m.includes('relation') && m.includes('does not exist');
}

type PageProps = {
  searchParams: Promise<{ q?: string; stage?: string }>;
};

export default async function LeadsPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session || !canAccessLeadTool('sales', session.role, session.team)) {
    redirect('/dashboard');
  }

  const { q = '', stage = 'all' } = await searchParams;
  const query = q.trim().toLowerCase();
  const stageFilter = LEAD_STAGE_OPTIONS.includes(stage as typeof LEAD_STAGE_OPTIONS[number]) ? stage : 'all';

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('leads')
    .select('id, name, email, company, stage, value, notes, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  const tableMissing = isTableMissing(error?.message);
  const unexpectedError = error && !tableMissing ? error.message : null;
  const allLeads: LeadRowData[] = (data as LeadRowData[] | null) ?? [];
  const leads = allLeads.filter(lead => {
    const matchesQuery = !query || [
      lead.name,
      lead.email ?? '',
      lead.company ?? '',
      lead.notes ?? '',
    ].some(value => value.toLowerCase().includes(query));
    const matchesStage = stageFilter === 'all' || lead.stage === stageFilter;
    return matchesQuery && matchesStage;
  });

  const openCount   = leads.filter(l => !['won', 'lost'].includes(l.stage)).length;
  const totalValue  = leads.filter(l => l.stage !== 'lost').reduce((s, l) => s + (l.value || 0), 0);
  const wonValue    = leads.filter(l => l.stage === 'won').reduce((s, l) => s + (l.value || 0), 0);
  const lostCount   = leads.filter(l => l.stage === 'lost').length;
  const exportRows = leads.map(lead => ({
    name: lead.name,
    email: lead.email ?? '',
    company: lead.company ?? '',
    stage: lead.stage,
    value: lead.value ? PHP.format(lead.value) : '',
    added: formatDate(lead.created_at),
    notes: lead.notes ?? '',
  }));

  return (
    <div className="space-y-6">
      <LeadToolHeader
        eyebrow="Sales tool"
        title="Sales Leads"
        description="Lightweight CRM. Capture leads, move them through the pipeline, close deals. No external services — everything stays in Supabase."
        action={!tableMissing && !unexpectedError && (
          <div className="flex flex-wrap items-start justify-end gap-2">
            <ToolResetButton
              label="Reset leads"
              description="Deletes all lead rows from Supabase for this tool. Use only when you intentionally want to clear the sales pipeline."
              confirmationText="DELETE LEADS"
              action={deleteAllLeads}
            />
            <LeadForm />
          </div>
        )}
      />

      {tableMissing && (
        <Card>
          <CardContent className="p-6 space-y-3">
            <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">Setup required</h2>
            <p className="text-sm text-(--rs-neutral-grey-600)">
              The <code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-xs">leads</code> table
              hasn&apos;t been created yet. Run{' '}
              <code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-xs">
                docs/migrations/add-leads-table.sql
              </code>{' '}
              in the Supabase SQL Editor, then refresh this page.
            </p>
          </CardContent>
        </Card>
      )}

      {unexpectedError && (
        <Card>
          <CardContent className="p-6 space-y-2">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="w-4 h-4" />
              <h2 className="font-serif text-base font-bold">Couldn&apos;t load leads</h2>
            </div>
            <p className="text-sm text-(--rs-neutral-grey-600)">{unexpectedError}</p>
          </CardContent>
        </Card>
      )}

      {!tableMissing && !unexpectedError && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={<Users      className="w-4 h-4" />} label="Open leads"     value={String(openCount)}      hint="not won / not lost" />
            <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Pipeline value" value={PHP.format(totalValue)} hint="excluding lost" />
            <StatCard icon={<Trophy     className="w-4 h-4" />} label="Closed-won"     value={PHP.format(wonValue)}   accent hint="all-time" />
            <StatCard icon={<XCircle    className="w-4 h-4" />} label="Lost"           value={String(lostCount)}      hint="all-time" />
          </div>

          <Card>
            <CardContent className="p-0">
              <form className="border-b border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) p-4">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
                  <label className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--rs-neutral-grey-400)" />
                    <input
                      name="q"
                      defaultValue={q}
                      placeholder="Search contact, company, email, or notes"
                      className="w-full rounded-lg border border-(--rs-neutral-grey-200) bg-white py-2 pl-9 pr-3 text-sm text-(--rs-neutral-grey-900) outline-none transition-colors focus:border-(--rs-primary-300) focus:ring-3 focus:ring-(--rs-primary-100)"
                    />
                  </label>
                  <label className="relative">
                    <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--rs-neutral-grey-400)" />
                    <select
                      name="stage"
                      defaultValue={stageFilter}
                      className="w-full rounded-lg border border-(--rs-neutral-grey-200) bg-white py-2 pl-9 pr-3 text-sm text-(--rs-neutral-grey-900) outline-none transition-colors focus:border-(--rs-primary-300) focus:ring-3 focus:ring-(--rs-primary-100)"
                    >
                      {LEAD_STAGE_OPTIONS.map(option => (
                        <option key={option} value={option}>
                          {option === 'all' ? 'All stages' : option[0].toUpperCase() + option.slice(1)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex gap-2">
                    <button className="rounded-lg bg-(--rs-primary-500) px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-(--rs-primary-600)">
                      Apply
                    </button>
                    <Link
                      href="/sales/leads"
                      className="rounded-lg border border-(--rs-neutral-grey-200) bg-white px-4 py-2 text-sm font-semibold text-(--rs-neutral-grey-700) transition-colors hover:bg-(--rs-neutral-grey-100)"
                    >
                      Reset
                    </Link>
                  </div>
                </div>
                <p className="mt-3 text-xs text-(--rs-neutral-grey-500)">
                  Showing {leads.length} of {allLeads.length} leads.
                </p>
              </form>
              <div className="border-b border-(--rs-neutral-grey-200) px-4 py-3">
                <SalesLeadExportButtons
                  title="Sales Leads Pipeline"
                  rows={exportRows}
                />
              </div>
              {leads.length === 0 ? (
                <div className="px-6 py-20 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-(--rs-primary-50) flex items-center justify-center mb-3">
                    <Users className="w-6 h-6 text-(--rs-primary-500)" />
                  </div>
                  <p className="text-sm font-semibold text-(--rs-neutral-grey-900)">No leads yet</p>
                  <p className="text-sm text-(--rs-neutral-grey-500) mt-1">
                    Click <strong>New Lead</strong> above to add your first opportunity.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid gap-3 p-4 md:hidden">
                    {leads.map(l => (
                      <div key={l.id} className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-(--rs-neutral-grey-900)">{l.name}</p>
                            {l.email && <p className="mt-0.5 truncate text-xs text-(--rs-neutral-grey-500)">{l.email}</p>}
                            <p className="mt-1 text-sm text-(--rs-neutral-grey-700)">{l.company ?? 'No company set'}</p>
                          </div>
                          <LeadDelete id={l.id} />
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-(--rs-neutral-grey-500)">Value</p>
                            <p className="mt-1 font-semibold text-(--rs-neutral-grey-900)">
                              {l.value ? PHP.format(l.value) : '—'}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-(--rs-neutral-grey-500)">Added</p>
                            <p className="mt-1 text-(--rs-neutral-grey-700)">{formatDate(l.created_at)}</p>
                          </div>
                        </div>
                        {l.notes && (
                          <p className="mt-3 rounded-lg bg-(--rs-neutral-grey-50) px-3 py-2 text-sm leading-relaxed text-(--rs-neutral-grey-700)">
                            {l.notes}
                          </p>
                        )}
                        <div className="mt-4">
                          <LeadStage id={l.id} stage={l.stage} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-sm">
                    <thead className="border-b border-(--rs-neutral-grey-200) text-left text-xs uppercase tracking-wider text-(--rs-neutral-grey-500) bg-(--rs-neutral-grey-50)">
                      <tr>
                        <th className="px-6 py-3 font-semibold">Contact</th>
                        <th className="px-4 py-3 font-semibold">Company</th>
                        <th className="px-4 py-3 font-semibold">Value</th>
                        <th className="px-4 py-3 font-semibold">Added</th>
                        <th className="px-4 py-3 font-semibold">Stage</th>
                        <th className="px-4 py-3 font-semibold w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-(--rs-neutral-grey-100)">
                      {leads.map(l => (
                        <tr key={l.id} className="hover:bg-(--rs-neutral-grey-50) transition-colors">
                          <td className="px-6 py-3.5">
                            <div className="font-medium text-(--rs-neutral-grey-900)">{l.name}</div>
                            {l.email && <div className="text-xs text-(--rs-neutral-grey-500) mt-0.5">{l.email}</div>}
                          </td>
                          <td className="px-4 py-3.5 text-(--rs-neutral-grey-700)">{l.company ?? '—'}</td>
                          <td className="px-4 py-3.5 text-(--rs-neutral-grey-700) tabular-nums">
                            {l.value ? PHP.format(l.value) : <span className="text-(--rs-neutral-grey-400)">—</span>}
                          </td>
                          <td className="px-4 py-3.5 text-(--rs-neutral-grey-500) whitespace-nowrap">{formatDate(l.created_at)}</td>
                          <td className="px-4 py-3.5"><LeadStage id={l.id} stage={l.stage} /></td>
                          <td className="px-4 py-3.5"><LeadDelete id={l.id} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
