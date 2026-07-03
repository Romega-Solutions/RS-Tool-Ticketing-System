import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AlertCircle, ArrowLeft, Briefcase, MessagesSquare, Trophy, Users2, Sparkles } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';
import { hasToolAccess } from '@/lib/rbac';
import { formatPhoneNumber } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/card';
import { LeadToolHeader, StatCard } from '@/components/lead-tool-header';
import { AtsTabs } from '../../../ats-tabs';
import { CandidateDelete, CandidateRating, CandidateStatus } from '../../../candidates/candidate-row';
import { candidateBelongsToPosition, displayApplicationCode, type PositionApplicantCandidate } from '@/lib/recruiting/position-applicants';

type Position = {
  id: number;
  job_title: string;
  placement_type: string | null;
  location: string | null;
  employment_type: string | null;
  is_open: boolean;
};

type Applicant = PositionApplicantCandidate & {
  full_name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string;
  rating: number | null;
  parsed_at: string | null;
  application_code: string | null;
  created_at: string;
};

const SOURCE_LABEL: Record<string, string> = {
  referral: 'Referral',
  linkedin: 'LinkedIn',
  job_board: 'Job board',
  direct: 'Direct',
  manual: 'Manual',
};

function isRelationMissing(msg: string | undefined) {
  const m = (msg ?? '').toLowerCase();
  return m.includes('relation') && m.includes('does not exist');
}

function isMissingPositionIdColumn(msg: string | undefined) {
  const m = (msg ?? '').toLowerCase();
  return m.includes('position_id') && (m.includes('schema cache') || m.includes('column') || m.includes('does not exist'));
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

async function loadApplicants(
  supabase: ReturnType<typeof createAdminClient>,
  position: Position,
): Promise<{ applicants: Applicant[]; setupError: string | null }> {
  const baseSelect = 'id, full_name, email, phone, position, source, status, rating, parsed_at, application_code, created_at';
  const { data, error } = await supabase
    .from('candidates')
    .select(`${baseSelect}, position_id`)
    .order('created_at', { ascending: false })
    .limit(1000);

  if (!error) {
    const rows = ((data ?? []) as Applicant[])
      .filter((candidate) => candidateBelongsToPosition(candidate, position));
    return { applicants: rows, setupError: null };
  }

  if (isMissingPositionIdColumn(error.message)) {
    const fallback = await supabase
      .from('candidates')
      .select(baseSelect)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (!fallback.error) {
      const rows = ((fallback.data ?? []) as Applicant[])
        .filter((candidate) => candidateBelongsToPosition(candidate, position));
      return { applicants: rows, setupError: null };
    }
    if (isRelationMissing(fallback.error.message)) {
      return { applicants: [], setupError: fallback.error.message };
    }
    throw new Error(fallback.error.message);
  }

  if (isRelationMissing(error.message)) {
    return { applicants: [], setupError: error.message };
  }

  throw new Error(error.message);
}

export default async function PositionApplicantsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || !hasToolAccess('recruiting', session.role, session.toolAccess)) {
    redirect('/dashboard');
  }

  const { id: idStr } = await params;
  const id = Number.parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const supabase = createAdminClient();
  const { data: position, error: positionError } = await supabase
    .from('positions')
    .select('id, job_title, placement_type, location, employment_type, is_open')
    .eq('id', id)
    .maybeSingle();

  if (positionError && isRelationMissing(positionError.message)) {
    return <SetupRequired message={positionError.message} />;
  }
  if (positionError) throw new Error(positionError.message);
  if (!position) notFound();

  const typedPosition = position as Position;
  const { applicants, setupError } = await loadApplicants(supabase, typedPosition);

  const terminal = new Set(['hired', 'failed', 'no_show', 'withdrew', 'rejected']);
  const interviewing = new Set(['interview_romega', 'endorsed_client', 'final_interview', 'offered', 'interview', 'offer']);
  const openCount = applicants.filter(candidate => !terminal.has(candidate.status)).length;
  const interviewCount = applicants.filter(candidate => interviewing.has(candidate.status)).length;
  const hiredCount = applicants.filter(candidate => candidate.status === 'hired').length;

  return (
    <div className="space-y-6">
      <Link
        href="/recruiting/positions"
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-(--rs-neutral-grey-200) bg-white px-3 text-sm font-semibold text-(--rs-neutral-grey-700) transition-colors hover:bg-(--rs-neutral-grey-50) focus:outline-none focus:ring-3 focus:ring-(--rs-primary-100)"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to positions
      </Link>

      <LeadToolHeader
        eyebrow="Recruiting tool"
        title={`${typedPosition.job_title} applicants`}
        description="Review candidates tied to this job post from application through hire."
        action={
          typedPosition.is_open ? (
            <span className="inline-flex min-h-9 items-center rounded-full bg-green-50 px-3 text-xs font-semibold text-green-700">
              Open position
            </span>
          ) : (
            <span className="inline-flex min-h-9 items-center rounded-full bg-(--rs-neutral-grey-100) px-3 text-xs font-semibold text-(--rs-neutral-grey-600)">
              Closed position
            </span>
          )
        }
      />

      <AtsTabs />

      {setupError ? (
        <SetupRequired message={setupError} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={<Users2 className="w-4 h-4" />} label="Applicants" value={String(applicants.length)} hint="for this job" />
            <StatCard icon={<MessagesSquare className="w-4 h-4" />} label="In interview" value={String(interviewCount)} hint="interview + offer" />
            <StatCard icon={<Briefcase className="w-4 h-4" />} label="Open pipeline" value={String(openCount)} hint="active candidates" />
            <StatCard icon={<Trophy className="w-4 h-4" />} label="Hired" value={String(hiredCount)} accent hint="converted" />
          </div>

          <Card>
            <CardContent className="p-0">
              {applicants.length === 0 ? (
                <div className="px-6 py-20 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-(--rs-primary-50)">
                    <Users2 className="h-6 w-6 text-(--rs-primary-500)" />
                  </div>
                  <p className="text-sm font-semibold text-(--rs-neutral-grey-900)">No applicants yet</p>
                  <p className="mx-auto mt-1 max-w-sm text-sm text-(--rs-neutral-grey-500)">
                    New public applications for this job will appear here.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) text-left text-xs uppercase tracking-wider text-(--rs-neutral-grey-500)">
                      <tr>
                        <th className="px-6 py-3 font-semibold">Candidate</th>
                        <th className="px-4 py-3 font-semibold">Source</th>
                        <th className="px-4 py-3 font-semibold">Rating</th>
                        <th className="px-4 py-3 font-semibold">Applied</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-(--rs-neutral-grey-100)">
                      {applicants.map(candidate => (
                        <tr key={candidate.id} className="group transition-colors hover:bg-(--rs-neutral-grey-50)">
                          <td className="px-6 py-3.5">
                            <Link
                              href={`/recruiting/candidates/${candidate.id}`}
                              className="block transition-colors hover:text-(--rs-primary-700)"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-(--rs-neutral-grey-900) group-hover:text-(--rs-primary-700)">
                                  {candidate.full_name}
                                </span>
                                {candidate.parsed_at && (
                                  <span title="Resume parsed" className="inline-flex items-center gap-0.5 rounded-full bg-(--rs-primary-50) px-1.5 py-0.5 text-[10px] font-semibold text-(--rs-primary-700)">
                                    <Sparkles className="h-2.5 w-2.5" /> AI
                                  </span>
                                )}
                              </div>
                              {(candidate.email || candidate.phone) && (
                                <div className="mt-0.5 flex gap-2 text-xs text-(--rs-neutral-grey-500)">
                                  {candidate.email && <span>{candidate.email}</span>}
                                  {candidate.email && candidate.phone && <span className="text-(--rs-neutral-grey-300)">·</span>}
                                  {candidate.phone && <span className="tabular-nums">{formatPhoneNumber(candidate.phone)}</span>}
                                </div>
                              )}
                              <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-(--rs-neutral-grey-500)">
                                {displayApplicationCode(candidate.application_code)}
                              </div>
                            </Link>
                          </td>
                          <td className="px-4 py-3.5 text-(--rs-neutral-grey-600)">
                            {candidate.source ? (
                              <span className="inline-flex rounded-md bg-(--rs-neutral-grey-100) px-2 py-0.5 text-xs">
                                {SOURCE_LABEL[candidate.source] ?? candidate.source}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3.5"><CandidateRating id={candidate.id} rating={candidate.rating} /></td>
                          <td className="px-4 py-3.5 whitespace-nowrap text-(--rs-neutral-grey-500)">{formatDate(candidate.created_at)}</td>
                          <td className="px-4 py-3.5"><CandidateStatus id={candidate.id} status={candidate.status} /></td>
                          <td className="px-4 py-3.5"><CandidateDelete id={candidate.id} /></td>
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

function SetupRequired({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        <div className="flex items-center gap-2 text-red-700">
          <AlertCircle className="h-4 w-4" />
          <h2 className="font-serif text-base font-bold">Recruiting setup required</h2>
        </div>
        <p className="text-sm text-(--rs-neutral-grey-600)">{message}</p>
        <p className="text-sm text-(--rs-neutral-grey-600)">
          Run the ATS migrations in Supabase, including{' '}
          <code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-xs">
            docs/migrations/add-candidates-position-id.sql
          </code>.
        </p>
      </CardContent>
    </Card>
  );
}
