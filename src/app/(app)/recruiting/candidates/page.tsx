import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card, CardContent } from '@/components/ui/card';
import { Users2, UserCheck, MessagesSquare, Trophy, AlertCircle, Sparkles, Search, Filter } from 'lucide-react';
import { LeadToolHeader, StatCard } from '@/components/lead-tool-header';
import { ToolResetButton } from '@/components/tool-reset-button';
import { getSession } from '@/lib/session';
import { canAccessLeadTool } from '@/lib/rbac';
import { CandidateForm } from './candidate-form';
import { CandidateStatus, CandidateRating, CandidateDelete } from './candidate-row';
import { ResumeUploadButton } from './resume-upload';
import { deleteAllCandidates } from './actions';
import { AtsTabs } from '../ats-tabs';
import { formatPhoneNumber } from '@/lib/format';

type CandidateRowData = {
  id:           number;
  full_name:    string;
  email:        string | null;
  phone:        string | null;
  position:     string | null;
  source:       string | null;
  status:       string;
  rating:       number | null;
  notes:        string | null;
  linkedin_url: string | null;
  parsed_at:    string | null;
  created_at:   string;
};

const SOURCE_LABEL: Record<string, string> = {
  referral: 'Referral', linkedin: 'LinkedIn', job_board: 'Job board', direct: 'Direct', manual: 'Manual',
};
const STATUS_OPTIONS = [
  'all',
  'pending_response',
  'interview_romega',
  'endorsed_client',
  'final_interview',
  'offered',
  'hired',
  'failed',
  'no_show',
  'unresponsive',
  'consider_other',
  'withdrew',
] as const;
const STATUS_LABEL: Record<string, string> = {
  pending_response: 'Pending Response',
  interview_romega: 'Interview - Romega',
  endorsed_client:  'Endorsed - Client',
  final_interview:  'Final Interview',
  offered:          'Offered',
  hired:            'Hired',
  failed:           'Failed',
  no_show:          'No Show',
  unresponsive:     'Unresponsive (>7d)',
  consider_other:   'Consider for other positions',
  withdrew:         'Declined / Withdrew',
};
const SOURCE_OPTIONS = ['all', 'manual', 'referral', 'linkedin', 'job_board', 'direct'] as const;

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
  searchParams: Promise<{ q?: string; status?: string; source?: string }>;
};

export default async function CandidatesPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session || !canAccessLeadTool('recruiting', session.role, session.team)) {
    redirect('/dashboard');
  }

  const { q = '', status = 'all', source = 'all' } = await searchParams;
  const query = q.trim().toLowerCase();
  const statusFilter = STATUS_OPTIONS.includes(status as typeof STATUS_OPTIONS[number]) ? status : 'all';
  const sourceFilter = SOURCE_OPTIONS.includes(source as typeof SOURCE_OPTIONS[number]) ? source : 'all';

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('candidates')
    .select('id, full_name, email, phone, position, source, status, rating, notes, linkedin_url, parsed_at, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  const errorMsg = error?.message;
  const tableMissing = isTableMissing(errorMsg);
  const unexpectedError = error && !tableMissing ? errorMsg : null;
  const allCandidates: CandidateRowData[] = (data as CandidateRowData[] | null) ?? [];
  const candidates = allCandidates.filter(candidate => {
    const matchesQuery = !query || [
      candidate.full_name,
      candidate.email ?? '',
      candidate.phone ?? '',
      candidate.position ?? '',
      candidate.notes ?? '',
    ].some(value => value.toLowerCase().includes(query));
    const matchesStatus = statusFilter === 'all' || candidate.status === statusFilter;
    const matchesSource = sourceFilter === 'all' || candidate.source === sourceFilter;
    return matchesQuery && matchesStatus && matchesSource;
  });

  const TERMINAL = new Set(['hired', 'failed', 'no_show', 'withdrew', 'rejected']);
  const INTERVIEWING = new Set(['interview_romega', 'endorsed_client', 'final_interview', 'offered', 'interview', 'offer']);
  const openCount      = candidates.filter(c => !TERMINAL.has(c.status)).length;
  const interviewCount = candidates.filter(c => INTERVIEWING.has(c.status)).length;
  const hiredCount     = candidates.filter(c => c.status === 'hired').length;
  const appliedCount   = candidates.filter(c => c.status === 'pending_response' || c.status === 'applied').length;

  return (
    <div className="space-y-6">
      <LeadToolHeader
        eyebrow="Recruiting tool"
        title="Applicant Tracking System"
        description="Lightweight ATS for tracking every candidate from application through hire. Upload a resume PDF and the n8n regex parser extracts name, contact, skills, experience, and education automatically."
        action={
          !tableMissing && !unexpectedError ? (
            <div className="flex flex-wrap items-start justify-end gap-2">
              <ToolResetButton
                label="Reset candidates"
                description="Deletes all candidate rows from Supabase for the ATS tool. Resume files in external storage are not touched by this action."
                confirmationText="DELETE CANDIDATES"
                action={deleteAllCandidates}
              />
              <ResumeUploadButton mode="create" variant="outline" />
              <CandidateForm />
            </div>
          ) : null
        }
      />

      <AtsTabs />

      {tableMissing && (
        <Card>
          <CardContent className="p-6 space-y-3">
            <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">Setup required</h2>
            <p className="text-sm text-(--rs-neutral-grey-600)">
              The <code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-xs">candidates</code> table
              hasn&apos;t been created yet. Run these in Supabase SQL Editor (in order):
            </p>
            <ol className="list-decimal text-sm text-(--rs-neutral-grey-700) ml-5 space-y-1">
              <li><code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-xs">docs/migrations/add-candidates-table.sql</code></li>
              <li><code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-xs">docs/migrations/add-resume-fields-to-candidates.sql</code></li>
            </ol>
          </CardContent>
        </Card>
      )}

      {unexpectedError && (
        <Card>
          <CardContent className="p-6 space-y-2">
            <div className="flex items-center gap-2 text-red-700">
              <AlertCircle className="w-4 h-4" />
              <h2 className="font-serif text-base font-bold">Couldn&apos;t load candidates</h2>
            </div>
            <p className="text-sm text-(--rs-neutral-grey-600)">{unexpectedError}</p>
          </CardContent>
        </Card>
      )}

      {!tableMissing && !unexpectedError && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={<Users2 className="w-4 h-4" />}         label="Open pipeline" value={String(openCount)}      hint="not hired / not rejected" />
            <StatCard icon={<MessagesSquare className="w-4 h-4" />} label="In interview"  value={String(interviewCount)} hint="interview + offer stages" />
            <StatCard icon={<UserCheck className="w-4 h-4" />}      label="Just applied"  value={String(appliedCount)}   hint="awaiting screening" />
            <StatCard icon={<Trophy className="w-4 h-4" />}         label="Hired"         value={String(hiredCount)}     accent hint="all-time" />
          </div>

          <Card>
            <CardContent className="p-0">
              <form className="border-b border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) p-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_160px_auto]">
                  <label className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--rs-neutral-grey-400)" />
                    <input
                      name="q"
                      defaultValue={q}
                      placeholder="Search candidate, role, email, phone, or notes"
                      className="w-full rounded-lg border border-(--rs-neutral-grey-200) bg-white py-2 pl-9 pr-3 text-sm text-(--rs-neutral-grey-900) outline-none transition-colors focus:border-(--rs-primary-300) focus:ring-3 focus:ring-(--rs-primary-100)"
                    />
                  </label>
                  <label className="relative">
                    <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--rs-neutral-grey-400)" />
                    <select
                      name="status"
                      defaultValue={statusFilter}
                      className="w-full rounded-lg border border-(--rs-neutral-grey-200) bg-white py-2 pl-9 pr-3 text-sm text-(--rs-neutral-grey-900) outline-none transition-colors focus:border-(--rs-primary-300) focus:ring-3 focus:ring-(--rs-primary-100)"
                    >
                      {STATUS_OPTIONS.map(option => (
                        <option key={option} value={option}>
                          {option === 'all' ? 'All statuses' : (STATUS_LABEL[option] ?? option)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <select
                    name="source"
                    defaultValue={sourceFilter}
                    className="w-full rounded-lg border border-(--rs-neutral-grey-200) bg-white px-3 py-2 text-sm text-(--rs-neutral-grey-900) outline-none transition-colors focus:border-(--rs-primary-300) focus:ring-3 focus:ring-(--rs-primary-100)"
                  >
                    {SOURCE_OPTIONS.map(option => (
                      <option key={option} value={option}>
                        {option === 'all' ? 'All sources' : (SOURCE_LABEL[option] ?? option)}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button className="rounded-lg bg-(--rs-primary-500) px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-(--rs-primary-600)">
                      Apply
                    </button>
                    <Link
                      href="/recruiting/candidates"
                      className="rounded-lg border border-(--rs-neutral-grey-200) bg-white px-4 py-2 text-sm font-semibold text-(--rs-neutral-grey-700) transition-colors hover:bg-(--rs-neutral-grey-100)"
                    >
                      Reset
                    </Link>
                  </div>
                </div>
                <p className="mt-3 text-xs text-(--rs-neutral-grey-500)">
                  Showing {candidates.length} of {allCandidates.length} candidates.
                </p>
              </form>
              {candidates.length === 0 ? (
                <div className="px-6 py-20 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-(--rs-primary-50) flex items-center justify-center mb-3">
                    <Users2 className="w-6 h-6 text-(--rs-primary-500)" />
                  </div>
                  <p className="text-sm font-semibold text-(--rs-neutral-grey-900)">No candidates yet</p>
                  <p className="text-sm text-(--rs-neutral-grey-500) mt-1 max-w-sm mx-auto">
                    Click <strong>Add from resume</strong> to auto-parse a PDF, or <strong>Add candidate</strong> to enter manually.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-(--rs-neutral-grey-200) text-left text-xs uppercase tracking-wider text-(--rs-neutral-grey-500) bg-(--rs-neutral-grey-50)">
                      <tr>
                        <th className="px-6 py-3 font-semibold">Candidate</th>
                        <th className="px-4 py-3 font-semibold">Position</th>
                        <th className="px-4 py-3 font-semibold">Source</th>
                        <th className="px-4 py-3 font-semibold">Rating</th>
                        <th className="px-4 py-3 font-semibold">Applied</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-(--rs-neutral-grey-100)">
                      {candidates.map(c => (
                        <tr key={c.id} className="hover:bg-(--rs-neutral-grey-50) transition-colors group">
                          <td className="px-6 py-3.5">
                            <Link
                              href={`/recruiting/candidates/${c.id}`}
                              className="block hover:text-(--rs-primary-700) transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-(--rs-neutral-grey-900) group-hover:text-(--rs-primary-700)">{c.full_name}</span>
                                {c.parsed_at && (
                                  <span title="Resume parsed" className="inline-flex items-center gap-0.5 rounded-full bg-(--rs-primary-50) px-1.5 py-0.5 text-[10px] font-semibold text-(--rs-primary-700)">
                                    <Sparkles className="w-2.5 h-2.5" /> AI
                                  </span>
                                )}
                              </div>
                              {(c.email || c.phone) && (
                                <div className="text-xs text-(--rs-neutral-grey-500) flex gap-2 mt-0.5">
                                  {c.email && <span>{c.email}</span>}
                                  {c.email && c.phone && <span className="text-(--rs-neutral-grey-300)">·</span>}
                                  {c.phone && <span className="tabular-nums">{formatPhoneNumber(c.phone)}</span>}
                                </div>
                              )}
                            </Link>
                          </td>
                          <td className="px-4 py-3.5 text-(--rs-neutral-grey-700)">{c.position ?? '—'}</td>
                          <td className="px-4 py-3.5 text-(--rs-neutral-grey-600)">
                            {c.source ? (
                              <span className="inline-flex rounded-md bg-(--rs-neutral-grey-100) px-2 py-0.5 text-xs">
                                {SOURCE_LABEL[c.source] ?? c.source}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3.5"><CandidateRating id={c.id} rating={c.rating} /></td>
                          <td className="px-4 py-3.5 text-(--rs-neutral-grey-500) whitespace-nowrap">{formatDate(c.created_at)}</td>
                          <td className="px-4 py-3.5"><CandidateStatus id={c.id} status={c.status} /></td>
                          <td className="px-4 py-3.5"><CandidateDelete id={c.id} /></td>
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
