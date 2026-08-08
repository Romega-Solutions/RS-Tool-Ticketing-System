import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';
import { hasToolAccess, defaultLandingPath } from '@/lib/rbac';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowLeft, Mail, Phone, MapPin, Link2, Globe, Briefcase,
  GraduationCap, Award, Languages as LanguagesIcon, Tag, Calendar,
  Sparkles, FileText, AlertCircle, User2, History as HistoryIcon,
  Hash, MailCheck, MailWarning, Download, Eye, ShieldCheck, Building2,
} from 'lucide-react';
import { CandidateStatus, CandidateRating, CandidateDelete } from '../candidate-row';
import { TalentConsentPanel } from '../talent-consent-panel';
import { ResumeUploadCard, UploadResumeButton } from '../resume-upload';
import { CandidateEditForm } from '../candidate-edit-form';
import { ResendEmailButton } from './resend-email-button';
import { formatPhoneNumber } from '@/lib/format';

type Candidate = {
  id:             number;
  full_name:      string;
  email:          string | null;
  phone:          string | null;
  position:       string | null;
  source:         string | null;
  status:         string;
  rating:         number | null;
  notes:          string | null;
  linkedin_url:   string | null;
  resume_url:     string | null;
  location:       string | null;
  website:        string | null;
  summary:        string | null;
  skills:         string[] | null;
  experience:     Array<{ company?: string|null; title?: string|null; start_date?: string|null; end_date?: string|null; description?: string|null }> | null;
  education:      Array<{ institution?: string|null; degree?: string|null; field?: string|null; graduation_year?: string|null }> | null;
  certifications: string[] | null;
  languages:      string[] | null;
  parsed_at:      string | null;
  created_at:     string;
  created_by:     number | null;
  assigned_to:    number | null;
  application_code:    string | null;
  last_email_template: string | null;
  last_email_sent_at:  string | null;
  is_public_talent:    boolean | null;
  consent_status:       string | null;
  consent_requested_at: string | null;
  consent_agreed_at:    string | null;
  consent_method:       string | null;
};

type HistoryRow = {
  id:         number;
  user_name:  string | null;
  field:      string | null;
  new_value:  string | null;
  summary:    string;
  created_at: string;
};

const VALID_PRE_EMPLOYMENT_TABS = ['background-check', 'documents'] as const;
type PreEmploymentTab = typeof VALID_PRE_EMPLOYMENT_TABS[number];

const SOURCE_LABEL: Record<string, string> = {
  referral: 'Referral', linkedin: 'LinkedIn', job_board: 'Job board', direct: 'Direct', manual: 'Manual',
};

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return iso; }
}

function formatDateRange(start: string | null | undefined, end: string | null | undefined) {
  const s = start?.trim() || '';
  const e = end?.trim() || '';
  if (!s && !e) return null;
  if (!e) return `${s} — Present`;
  if (!s) return e;
  return `${s} — ${e}`;
}

function formatHistoryTime(iso: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Manila',
    }).formatToParts(new Date(iso));
    const lookup: Record<string, string> = {};
    for (const p of parts) lookup[p.type] = p.value;
    return `${lookup.month ?? ''} ${lookup.day ?? ''} ${lookup.hour ?? ''}:${lookup.minute ?? ''}${lookup.dayPeriod ?? ''}`.trim();
  } catch {
    return iso;
  }
}

function abbreviateName(name: string | null | undefined): string {
  const value = (name ?? '').trim();
  if (!value) return 'Someone';
  const parts = value.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last[0].toUpperCase()}`;
}

export default async function CandidateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ preEmployment?: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session || !hasToolAccess('recruiting', session.role, session.toolAccess)) {
    redirect(session ? defaultLandingPath(session.role) : '/login');
  }

  const { id: idParam } = await params;
  const id = parseInt(idParam, 10);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('candidates')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error?.message?.toLowerCase().includes('does not exist')) {
    return <SetupRequired />;
  }
  if (!data) notFound();

  const c = data as Candidate;
  const requestedPreEmploymentTab = (await searchParams).preEmployment;
  const preEmploymentTabValue = Array.isArray(requestedPreEmploymentTab)
    ? requestedPreEmploymentTab[0]
    : requestedPreEmploymentTab;
  const activePreEmploymentTab: PreEmploymentTab = VALID_PRE_EMPLOYMENT_TABS.includes(
    preEmploymentTabValue as PreEmploymentTab,
  )
    ? preEmploymentTabValue as PreEmploymentTab
    : 'background-check';

  // "Added by" = the human who manually created the record (created_by).
  // Public applicants have created_by = null — nobody added them, they applied
  // themselves — and assigned_to points at the requisition owner instead. We
  // resolve both so the panel can say "Applied online" + "Assigned to <owner>"
  // rather than misleadingly crediting the requisition owner as the adder.
  let addedByName: string | null = null;
  let assignedToName: string | null = null;
  const lookupIds = [c.created_by, c.assigned_to].filter(
    (v): v is number => typeof v === 'number',
  );
  if (lookupIds.length) {
    const { data: us } = await supabase
      .from('users')
      .select('id, name')
      .in('id', lookupIds);
    const nameOf = (id: number | null) =>
      (id != null ? (us?.find((u) => u.id === id)?.name as string | undefined) : undefined) ?? null;
    addedByName    = nameOf(c.created_by);
    assignedToName = nameOf(c.assigned_to);
  }
  const selfApplied = c.created_by == null;

  // History feed (newest → oldest). Table may not exist on older deploys.
  let history: HistoryRow[] = [];
  let historyTableMissing = false;
  const { data: histData, error: histError } = await supabase
    .from('candidate_history')
    .select('id, user_name, field, new_value, summary, created_at')
    .eq('candidate_id', id)
    .order('created_at', { ascending: false })
    .limit(200);
  if (histError) {
    if (histError.message?.toLowerCase().includes('does not exist')) {
      historyTableMissing = true;
    }
  } else if (histData) {
    history = histData as HistoryRow[];
  }

  const hasParsedData =
    c.parsed_at || c.summary || (c.skills?.length ?? 0) > 0 ||
    (c.experience?.length ?? 0) > 0 || (c.education?.length ?? 0) > 0;
  const showPreEmployment = c.status === 'offered' || c.status === 'hired';

  // If the most recent email-related event was a failure, surface a Resend
  // button. We look at email_sent / email_failed rows only and ignore
  // unrelated history (status, name, etc.).
  const lastEmailEvent = history.find(h => h.field === 'email_sent' || h.field === 'email_failed') ?? null;
  const lastFailedEmailContext = lastEmailEvent && lastEmailEvent.field === 'email_failed'
    ? // For failed events we stored the attempted context in old_value via the
      // `fireAutoCommunication` helper. The history projection doesn't return
      // it here, so fall back to a generic "acknowledgment" retry — the n8n
      // workflow figures out the right template from the candidate's status.
      (lastEmailEvent.new_value ?? 'acknowledgment')
    : null;

  return (
    <div className="space-y-6">
      <Link
        href="/recruiting/candidates"
        className="inline-flex items-center gap-1.5 text-sm text-(--rs-neutral-grey-500) hover:text-(--rs-primary-600) transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to candidates
      </Link>

      {/* Hero */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-start gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-(--rs-primary-500) to-(--rs-primary-700) text-white text-xl font-bold shadow-sm">
              {initials(c.full_name)}
            </div>

            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="font-serif text-2xl font-bold text-(--rs-neutral-grey-900) leading-tight">
                    {c.full_name}
                  </h1>
                  {c.position && (
                    <p className="mt-0.5 text-sm text-(--rs-neutral-grey-600)">
                      Applying for <strong className="text-(--rs-neutral-grey-900)">{c.position}</strong>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {c.is_public_talent && (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-green-300 bg-green-50 px-2 py-1 text-xs font-medium text-green-700">
                      <Eye className="w-3 h-3" /> Public
                    </span>
                  )}
                  <CandidateRating id={c.id} rating={c.rating} />
                  <CandidateStatus id={c.id} status={c.status} />
                  <CandidateEditForm
                    id={c.id}
                    full_name={c.full_name}
                    email={c.email}
                    phone={c.phone}
                    position={c.position}
                    education={(c.education ?? []).map(e => ({
                      institution:     e.institution     ?? null,
                      degree:          e.degree          ?? null,
                      field:           e.field           ?? null,
                      graduation_year: e.graduation_year ?? null,
                    }))}
                    experience={(c.experience ?? []).map(e => ({
                      company:     e.company     ?? null,
                      title:       e.title       ?? null,
                      start_date:  e.start_date  ?? null,
                      end_date:    e.end_date    ?? null,
                      description: e.description ?? null,
                    }))}
                  />
                  <CandidateDelete id={c.id} />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-(--rs-neutral-grey-700)">
                {c.email    && <ContactPill icon={<Mail     className="w-3.5 h-3.5" />} text={c.email}    href={`mailto:${c.email}`} />}
                {c.phone    && <ContactPill icon={<Phone    className="w-3.5 h-3.5" />} text={formatPhoneNumber(c.phone)} href={`tel:${c.phone.replace(/\s+/g, '')}`} />}
                {c.location && <ContactPill icon={<MapPin   className="w-3.5 h-3.5" />} text={c.location} />}
                {c.linkedin_url && <ContactPill icon={<Link2 className="w-3.5 h-3.5" />} text="LinkedIn" href={c.linkedin_url} />}
                {c.website  && <ContactPill icon={<Globe    className="w-3.5 h-3.5" />} text="Website"  href={c.website} />}
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-(--rs-neutral-grey-500)">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" /> Added {formatDate(c.created_at)}
                </span>
                {addedByName ? (
                  <span className="inline-flex items-center gap-1.5">
                    <User2 className="w-3 h-3" /> Added by <strong className="text-(--rs-neutral-grey-700)">{addedByName}</strong>
                  </span>
                ) : selfApplied ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Globe className="w-3 h-3" /> Applied online
                  </span>
                ) : null}
                {c.source && (
                  <span className="inline-flex items-center gap-1.5">
                    <Tag className="w-3 h-3" /> {SOURCE_LABEL[c.source] ?? c.source}
                  </span>
                )}
                {c.parsed_at && (
                  <span className="inline-flex items-center gap-1.5 text-(--rs-primary-600)">
                    <Sparkles className="w-3 h-3" /> Resume parsed {formatDate(c.parsed_at)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {c.summary && (
            <Section title="Summary">
              <p className="text-sm text-(--rs-neutral-grey-700) leading-relaxed whitespace-pre-wrap">{c.summary}</p>
            </Section>
          )}

          {(c.skills?.length ?? 0) > 0 && (
            <Section title={`Skills · ${c.skills!.length}`}>
              <div className="flex flex-wrap gap-1.5">
                {c.skills!.map((s, i) => (
                  <span key={i} className="rounded-md bg-(--rs-primary-50) px-2.5 py-1 text-xs font-medium text-(--rs-primary-800)">
                    {s}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {(c.experience?.length ?? 0) > 0 && (
            <Section title={`Experience · ${c.experience!.length}`} icon={<Briefcase className="w-4 h-4" />}>
              <ol className="relative space-y-5 border-l border-(--rs-neutral-grey-200) pl-5">
                {c.experience!.map((e, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[26px] top-1.5 h-2 w-2 rounded-full bg-(--rs-primary-500) ring-4 ring-white" />
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h4 className="font-semibold text-(--rs-neutral-grey-900)">
                        {e.title || 'Role'} {e.company && <span className="font-normal text-(--rs-neutral-grey-600)">@ {e.company}</span>}
                      </h4>
                      {formatDateRange(e.start_date, e.end_date) && (
                        <span className="text-xs text-(--rs-neutral-grey-500) whitespace-nowrap">
                          {formatDateRange(e.start_date, e.end_date)}
                        </span>
                      )}
                    </div>
                    {e.description && (
                      <p className="mt-1.5 text-sm text-(--rs-neutral-grey-700) leading-relaxed whitespace-pre-wrap">{e.description}</p>
                    )}
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {(c.education?.length ?? 0) > 0 && (
            <Section title={`Education · ${c.education!.length}`} icon={<GraduationCap className="w-4 h-4" />}>
              <ul className="space-y-3">
                {c.education!.map((e, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="mt-1 h-2 w-2 rounded-full bg-(--rs-accent-500) shrink-0" />
                    <div className="flex flex-wrap items-baseline justify-between gap-2 flex-1">
                      <div>
                        <p className="text-sm font-semibold text-(--rs-neutral-grey-900)">{e.institution || 'Institution'}</p>
                        <p className="text-xs text-(--rs-neutral-grey-600)">
                          {[e.degree, e.field].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </div>
                      {e.graduation_year && (
                        <span className="text-xs text-(--rs-neutral-grey-500) whitespace-nowrap">{e.graduation_year}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {((c.certifications?.length ?? 0) > 0 || (c.languages?.length ?? 0) > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {(c.certifications?.length ?? 0) > 0 && (
                <Section title="Certifications" icon={<Award className="w-4 h-4" />}>
                  <ul className="space-y-1.5 text-sm text-(--rs-neutral-grey-700)">
                    {c.certifications!.map((cert, i) => <li key={i}>· {cert}</li>)}
                  </ul>
                </Section>
              )}
              {(c.languages?.length ?? 0) > 0 && (
                <Section title="Languages" icon={<LanguagesIcon className="w-4 h-4" />}>
                  <div className="flex flex-wrap gap-1.5">
                    {c.languages!.map((lang, i) => (
                      <span key={i} className="rounded-md bg-(--rs-neutral-grey-100) px-2.5 py-1 text-xs font-medium text-(--rs-neutral-grey-700)">
                        {lang}
                      </span>
                    ))}
                  </div>
                </Section>
              )}
            </div>
          )}

          {c.notes && (
            <Section title="Internal notes" icon={<FileText className="w-4 h-4" />}>
              <p className="text-sm text-(--rs-neutral-grey-700) leading-relaxed whitespace-pre-wrap">{c.notes}</p>
            </Section>
          )}

          {showPreEmployment && (
            <>
              <PreEmploymentTabBar id={c.id} active={activePreEmploymentTab} />
              {activePreEmploymentTab === 'background-check' && <PreEmploymentBackgroundCheckTab />}
              {activePreEmploymentTab === 'documents' && <PreEmploymentDocumentsTab />}
            </>
          )}
        </div>

        {/* Right rail */}
        <aside className="space-y-5">
          <TalentConsentPanel
            id={c.id}
            email={c.email}
            isPublic={!!c.is_public_talent}
            consentStatus={(c.consent_status ?? 'none') as 'none' | 'requested' | 'agreed' | 'revoked'}
            consentRequestedAt={c.consent_requested_at}
            consentAgreedAt={c.consent_agreed_at}
            consentMethod={c.consent_method}
          />

          <ResumeUploadCard candidateId={c.id} />

          {!hasParsedData && (
            <div className="rounded-xl border border-(--rs-accent-200) bg-(--rs-accent-50)/50 p-4">
              <div className="flex gap-2 text-(--rs-accent-700)">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">No parsed resume yet</p>
                  <p className="text-xs mt-1 text-(--rs-accent-700)/80">
                    Upload a PDF/DOCX above to auto-fill summary, skills, experience, and education.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-4 space-y-2.5">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-(--rs-neutral-grey-500)">Quick facts</h3>
            {c.application_code && (
              <KvRow
                label="Application"
                value={
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] tracking-tight text-(--rs-primary-700)">
                    <Hash className="w-3 h-3" /> {c.application_code}
                  </span>
                }
              />
            )}
            <KvRow label="Status"   value={<span className="capitalize">{c.status}</span>} />
            <KvRow label="Rating"   value={c.rating ? `${c.rating}/5` : '—'} />
            <KvRow label="Source"   value={c.source ? (SOURCE_LABEL[c.source] ?? c.source) : '—'} />
            <KvRow label="Added"    value={formatDate(c.created_at) ?? '—'} />
            <KvRow
              label="Added by"
              value={
                addedByName
                  ? addedByName
                  : selfApplied
                    ? <span className="text-(--rs-neutral-grey-600)">Applied online</span>
                    : <span className="text-(--rs-neutral-grey-400)">—</span>
              }
            />
            {assignedToName && c.assigned_to !== c.created_by && (
              <KvRow label="Assigned to" value={assignedToName} />
            )}
            <KvRow label="Parsed"   value={c.parsed_at ? formatDate(c.parsed_at) : <span className="text-(--rs-neutral-grey-400)">Not yet</span>} />
            <KvRow
              label="Last email"
              value={
                c.last_email_template ? (
                  <span className="inline-flex items-center gap-1 text-(--rs-neutral-grey-800)">
                    <MailCheck className="w-3 h-3 text-(--rs-primary-600)" />
                    <span className="font-mono text-[10px]">{c.last_email_template}</span>
                    <span className="text-(--rs-neutral-grey-400)">·</span>
                    <span className="text-(--rs-neutral-grey-500)">{formatDate(c.last_email_sent_at) ?? ''}</span>
                  </span>
                ) : (
                  <span className="text-(--rs-neutral-grey-400)">none</span>
                )
              }
            />
          </div>

          {/* Resume + email controls */}
          <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-4 space-y-2.5">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-(--rs-neutral-grey-500)">Actions</h3>
              {c.resume_url && (
                <a
                  href={c.resume_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-(--rs-neutral-grey-200) bg-white px-3 py-1.5 text-xs font-semibold text-(--rs-neutral-grey-800) hover:bg-(--rs-neutral-grey-50) transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Download resume
                </a>
              )}
              <UploadResumeButton candidateId={c.id} hasResume={!!c.resume_url} />
              {lastFailedEmailContext && (
                <div className="space-y-1.5">
                  <p className="inline-flex items-center gap-1 text-[11px] text-red-700">
                    <MailWarning className="w-3 h-3" /> Last email failed
                  </p>
                  <ResendEmailButton
                    candidateId={c.id}
                    template={lastFailedEmailContext}
                  />
                </div>
              )}
            </div>

          {/* History */}
          <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <HistoryIcon className="w-3.5 h-3.5 text-(--rs-primary-600)" />
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-(--rs-neutral-grey-500)">History</h3>
            </div>
            {historyTableMissing ? (
              <p className="text-xs text-(--rs-neutral-grey-500) leading-relaxed">
                History table not yet created. Apply{' '}
                <code className="rounded bg-(--rs-neutral-grey-100) px-1 py-0.5">
                  add-ats-history-and-positions.sql
                </code>{' '}
                in Supabase SQL Editor.
              </p>
            ) : history.length === 0 ? (
              <p className="text-xs text-(--rs-neutral-grey-500)">No changes recorded yet.</p>
            ) : (
              <ol className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                {history.map(h => (
                  <li key={h.id} className="text-xs leading-snug">
                    <span className="text-(--rs-neutral-grey-500)">{formatHistoryTime(h.created_at)}</span>
                    <span className="text-(--rs-neutral-grey-400)"> — </span>
                    <span className="font-semibold text-(--rs-neutral-grey-800)">{abbreviateName(h.user_name)}</span>
                    <span className="text-(--rs-neutral-grey-400)">: </span>
                    <span className="text-(--rs-neutral-grey-700)">{h.summary}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="font-serif text-base font-bold text-(--rs-neutral-grey-900) flex items-center gap-2 mb-3">
          {icon && <span className="text-(--rs-primary-600)">{icon}</span>}
          {title}
        </h2>
        {children}
      </CardContent>
    </Card>
  );
}

function PreEmploymentBackgroundCheckTab() {
  return (
    <div className="space-y-6">
      <Section title="Character references · 0" icon={<Mail className="w-4 h-4" />}>
        <PreEmploymentEmptyRow text="No references yet. Character reference requests and responses will be managed here." />
      </Section>
      <Section title="Employment verifications · 0" icon={<Building2 className="w-4 h-4" />}>
        <PreEmploymentEmptyRow text="No verifications yet. Previous employment verification will be managed here." />
      </Section>
    </div>
  );
}

function PreEmploymentDocumentsTab() {
  return (
    <Section title="Pre-Employment Documents" icon={<FileText className="w-4 h-4" />}>
      <p className="text-xs leading-relaxed text-(--rs-neutral-grey-600)">
        The document package will be managed here in a later phase.
      </p>
      <div className="mt-3 divide-y divide-(--rs-neutral-grey-200) rounded-lg border border-(--rs-neutral-grey-200) bg-white px-3">
        <PreEmploymentDocument name="Statement of Work" />
        <PreEmploymentDocument name="Job Description" />
        <PreEmploymentDocument name="AI Policy" />
      </div>
    </Section>
  );
}

function PreEmploymentEmptyRow({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50)/40 px-4 py-6 text-center text-xs text-(--rs-neutral-grey-500)">
      {text}
    </div>
  );
}

function PreEmploymentTabBar({ id, active }: { id: number; active: PreEmploymentTab }) {
  const tabs: { id: PreEmploymentTab; label: string; icon: typeof Mail }[] = [
    { id: 'background-check', label: 'Background Check', icon: ShieldCheck },
    { id: 'documents',        label: 'Documents',        icon: FileText },
  ];

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex gap-1 rounded-xl border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) p-1">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = tab.id === active;
          return (
            <Link
              key={tab.id}
              href={`/recruiting/candidates/${id}?preEmployment=${tab.id}`}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-white text-(--rs-primary-700) shadow-sm border border-(--rs-neutral-grey-200)'
                  : 'text-(--rs-neutral-grey-600) hover:text-(--rs-neutral-grey-900)'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function PreEmploymentDocument({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <span className="font-medium text-(--rs-neutral-grey-800)">{name}</span>
      <PreEmploymentStatus />
    </div>
  );
}

function PreEmploymentStatus() {
  return (
    <span className="inline-flex shrink-0 rounded-full bg-(--rs-neutral-grey-200) px-2 py-0.5 text-[11px] font-semibold text-(--rs-neutral-grey-600)">
      Not Started
    </span>
  );
}

function ContactPill({ icon, text, href }: { icon: React.ReactNode; text: string; href?: string }) {
  const content = (
    <span className="inline-flex items-center gap-1.5 rounded-md hover:bg-(--rs-neutral-grey-100) px-1.5 py-0.5 transition-colors">
      <span className="text-(--rs-neutral-grey-500)">{icon}</span>
      <span className="truncate">{text}</span>
    </span>
  );
  return href ? <a href={href} target="_blank" rel="noreferrer" className="text-(--rs-primary-700) hover:underline">{content}</a> : content;
}

function KvRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-(--rs-neutral-grey-500)">{label}</span>
      <span className="text-(--rs-neutral-grey-900) font-medium text-right">{value}</span>
    </div>
  );
}

function SetupRequired() {
  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">Setup required</h2>
        <p className="text-sm text-(--rs-neutral-grey-600)">
          The candidates table hasn&apos;t been created yet. Run the migrations under{' '}
          <code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-xs">docs/migrations/</code>{' '}
          in the Supabase SQL Editor.
        </p>
      </CardContent>
    </Card>
  );
}
