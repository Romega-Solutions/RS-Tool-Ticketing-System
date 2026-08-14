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
import { SendCandidateEmploymentVerificationEmailsButton, SendCandidateReferenceEmailsButton, SendPreEmploymentBgCheckButton } from '../pre-employment-actions';
import { EmploymentVerificationResponseModal, ReferenceResponseModal } from '../reference-response-modal';
import { MarkCandidateSowSignedButton, PreEmploymentDocumentUpload, SendCandidateDocumentPackageButton } from '../pre-employment-document-upload';
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

type PreEmploymentRequestRow = {
  id:             number;
  sent_at:        string;
  expires_at:     string;
  submitted_at:   string | null;
  invalidated_at: string | null;
};

type PreEmploymentSubmissionRow = {
  id:           number;
  submitted_at: string;
  payload:      unknown;
};

type CharacterReference = {
  id?: number;
  name: string;
  email: string;
  phone: string;
  company: string;
  jobTitle: string;
  relationship: string;
  bestTimeToCall: string;
  requestSentAt?: string | null;
  respondedAt?: string | null;
  responsePayload?: unknown;
};

type CandidateReferenceRow = {
  id:                 number;
  reference_number:   number;
  referee_name:       string;
  referee_email:      string;
  referee_phone:      string | null;
  referee_company:    string | null;
  referee_job_title:  string | null;
  relationship:       string | null;
  best_time_to_call:  string | null;
  request_sent_at:    string | null;
  responded_at:       string | null;
};

type CandidateReferenceSubmissionRow = {
  reference_id: number;
  submitted_at: string;
  payload: unknown;
};

type EmploymentVerification = {
  id?: number;
  company: string;
  contactName: string;
  email: string;
  phone: string;
  bestTimeToCall: string;
  requestSentAt?: string | null;
  respondedAt?: string | null;
  responsePayload?: unknown;
};

type CandidateEmploymentVerificationRow = {
  id: number; company: string; hr_contact_name: string | null; hr_email: string;
  hr_phone: string | null; best_time_to_call: string | null;
  request_sent_at: string | null; responded_at: string | null;
};

type CandidateEmploymentVerificationSubmissionRow = {
  verification_id: number; submitted_at: string; payload: unknown;
};
type CandidatePreEmploymentDocumentRow = { kind: 'sow' | 'job_description' | 'ai_policy' | 'nda'; file_name: string; signed_url: string; uploaded_at: string; sent_at: string | null; signed_at: string | null; };

const VALID_PRE_EMPLOYMENT_TABS = ['information', 'background-check', 'documents'] as const;
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

function payloadText(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function backgroundCheckEntries(payload: unknown): {
  references: CharacterReference[];
  verifications: EmploymentVerification[];
} {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { references: [], verifications: [] };
  }
  const data = payload as Record<string, unknown>;
  const references = [1, 2, 3].map(index => ({
    name: payloadText(data, `reference_${index}_name`),
    email: payloadText(data, `reference_${index}_email`),
    phone: payloadText(data, `reference_${index}_phone`),
    company: payloadText(data, `reference_${index}_company`),
    jobTitle: payloadText(data, `reference_${index}_jobTitle`),
    relationship: payloadText(data, `reference_${index}_relationship`),
    bestTimeToCall: payloadText(data, `reference_${index}_bestTimetoCall`),
  })).filter(reference => reference.name || reference.email || reference.phone);
  const verifications = [1, 2, 3].map(index => ({
    company: payloadText(data, `employer_${index}_company`),
    contactName: payloadText(data, `employer_${index}_hr_contact_name`),
    email: payloadText(data, `employer_${index}_hr_email`),
    phone: payloadText(data, `employer_${index}_phone`),
    bestTimeToCall: payloadText(data, `employer_${index}_bestTimetoCall`),
  })).filter(verification => verification.company || verification.contactName || verification.email || verification.phone);
  return { references, verifications };
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
  const showPreEmployment = c.status === 'offered' || c.status === 'hired';
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

  let backgroundCheckRequest: PreEmploymentRequestRow | null = null;
  let backgroundCheckSubmission: PreEmploymentSubmissionRow | null = null;
  let candidateReferences: CandidateReferenceRow[] = [];
  let candidateReferenceSubmissions: CandidateReferenceSubmissionRow[] = [];
  let candidateEmploymentVerifications: CandidateEmploymentVerificationRow[] = [];
  let candidateEmploymentVerificationSubmissions: CandidateEmploymentVerificationSubmissionRow[] = [];
  let candidateDocuments: CandidatePreEmploymentDocumentRow[] = [];
  if (showPreEmployment) {
    const [requestResult, submissionResult] = await Promise.all([
      supabase
        .from('candidate_pre_employment_requests')
        .select('id, sent_at, expires_at, submitted_at, invalidated_at')
        .eq('candidate_id', id)
        .eq('form_key', 'background_check')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('candidate_pre_employment_submissions')
        .select('id, submitted_at, payload')
        .eq('candidate_id', id)
        .eq('form_key', 'background_check')
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // The pre-employment migration may not have been applied yet. Preserve the
    // candidate profile and its original placeholder state in that situation.
    if (!requestResult.error && requestResult.data) {
      backgroundCheckRequest = requestResult.data as PreEmploymentRequestRow;
    }
    if (!submissionResult.error && submissionResult.data) {
      backgroundCheckSubmission = submissionResult.data as PreEmploymentSubmissionRow;
    }
    // References are recruitment-owned after the candidate submits the
    // background-check form. Do not couple this query to only the latest form
    // submission: a saved referee response must remain visible on the profile.
    const { data: referencesData, error: referencesError } = await supabase
      .from('candidate_references')
      .select('id, reference_number, referee_name, referee_email, referee_phone, referee_company, referee_job_title, relationship, best_time_to_call, request_sent_at, responded_at')
      .eq('candidate_id', id)
      .order('reference_number', { ascending: true });
    if (!referencesError && referencesData) {
      candidateReferences = referencesData as CandidateReferenceRow[];
    }
    if (candidateReferences.length > 0) {
      const { data: referenceSubmissionData, error: referenceSubmissionsError } = await supabase
        .from('candidate_reference_form_submissions')
        .select('reference_id, submitted_at, payload')
        .in('reference_id', candidateReferences.map(reference => reference.id))
        .order('submitted_at', { ascending: false });
      if (!referenceSubmissionsError && referenceSubmissionData) {
        candidateReferenceSubmissions = referenceSubmissionData as CandidateReferenceSubmissionRow[];
      }
    }
    const { data: employmentData, error: employmentError } = await supabase
      .from('candidate_employment_verifications')
      .select('id, company, hr_contact_name, hr_email, hr_phone, best_time_to_call, request_sent_at, responded_at')
      .eq('candidate_id', id)
      .order('verification_number', { ascending: true });
    if (!employmentError && employmentData) {
      candidateEmploymentVerifications = employmentData as CandidateEmploymentVerificationRow[];
    }
    if (candidateEmploymentVerifications.length > 0) {
      const { data: employmentSubmissionData, error: employmentSubmissionsError } = await supabase
        .from('candidate_employment_verification_form_submissions')
        .select('verification_id, submitted_at, payload')
        .in('verification_id', candidateEmploymentVerifications.map(verification => verification.id))
        .order('submitted_at', { ascending: false });
      if (!employmentSubmissionsError && employmentSubmissionData) {
        candidateEmploymentVerificationSubmissions = employmentSubmissionData as CandidateEmploymentVerificationSubmissionRow[];
      }
    }
    const { data: documentsData, error: documentsError } = await supabase
      .from('candidate_pre_employment_documents').select('kind, file_name, signed_url, uploaded_at, sent_at, signed_at').eq('candidate_id', id);
    if (!documentsError && documentsData) {
      candidateDocuments = documentsData as CandidatePreEmploymentDocumentRow[];
    } else if (documentsError?.message.toLowerCase().includes('signed_at')) {
      // Keep existing documents visible if the initial documents migration was
      // applied but its later signed_at follow-up has not been run yet.
      const { data: legacyDocuments, error: legacyDocumentsError } = await supabase
        .from('candidate_pre_employment_documents').select('kind, file_name, signed_url, uploaded_at, sent_at').eq('candidate_id', id);
      if (!legacyDocumentsError && legacyDocuments) {
        candidateDocuments = (legacyDocuments as Array<Omit<CandidatePreEmploymentDocumentRow, 'signed_at'>>)
          .map(document => ({ ...document, signed_at: null }));
      }
    }
  }

  const hasParsedData =
    c.parsed_at || c.summary || (c.skills?.length ?? 0) > 0 ||
    (c.experience?.length ?? 0) > 0 || (c.education?.length ?? 0) > 0;

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
          {!showPreEmployment && c.summary && (
            <Section title="Summary">
              <p className="text-sm text-(--rs-neutral-grey-700) leading-relaxed whitespace-pre-wrap">{c.summary}</p>
            </Section>
          )}

          {!showPreEmployment && (c.skills?.length ?? 0) > 0 && (
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

          {!showPreEmployment && (c.experience?.length ?? 0) > 0 && (
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

          {!showPreEmployment && (c.education?.length ?? 0) > 0 && (
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

          {!showPreEmployment && ((c.certifications?.length ?? 0) > 0 || (c.languages?.length ?? 0) > 0) && (
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

          {!showPreEmployment && c.notes && (
            <Section title="Internal notes" icon={<FileText className="w-4 h-4" />}>
              <p className="text-sm text-(--rs-neutral-grey-700) leading-relaxed whitespace-pre-wrap">{c.notes}</p>
            </Section>
          )}

          {showPreEmployment && (
            <>
              <PreEmploymentTabBar id={c.id} active={activePreEmploymentTab} />
              {activePreEmploymentTab === 'information' && <PreEmploymentCandidateInformationTab candidate={c} />}
              {activePreEmploymentTab === 'background-check' && (
                <PreEmploymentBackgroundCheckTab
                  candidateId={c.id}
                  canSend={c.status === 'offered'}
                  request={backgroundCheckRequest}
                  submission={backgroundCheckSubmission}
                  candidateReferences={candidateReferences}
                  candidateReferenceSubmissions={candidateReferenceSubmissions}
                  candidateEmploymentVerifications={candidateEmploymentVerifications}
                  candidateEmploymentVerificationSubmissions={candidateEmploymentVerificationSubmissions}
                />
              )}
              {activePreEmploymentTab === 'documents' && <PreEmploymentDocumentsTab candidateId={c.id} canUpload={c.status === 'offered'} documents={candidateDocuments} />}
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

function Section({
  title, icon, action, children,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-serif text-base font-bold text-(--rs-neutral-grey-900)">
            {icon && <span className="text-(--rs-primary-600)">{icon}</span>}
            {title}
          </h2>
          {action}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function PreEmploymentBackgroundCheckTab({
  candidateId, canSend, request, submission, candidateReferences, candidateReferenceSubmissions,
  candidateEmploymentVerifications, candidateEmploymentVerificationSubmissions,
}: {
  candidateId: number;
  canSend: boolean;
  request: PreEmploymentRequestRow | null;
  submission: PreEmploymentSubmissionRow | null;
  candidateReferences: CandidateReferenceRow[];
  candidateReferenceSubmissions: CandidateReferenceSubmissionRow[];
  candidateEmploymentVerifications: CandidateEmploymentVerificationRow[];
  candidateEmploymentVerificationSubmissions: CandidateEmploymentVerificationSubmissionRow[];
}) {
  const { references: payloadReferences, verifications: payloadVerifications } = backgroundCheckEntries(submission?.payload);
  const submissionsByReferenceId = new Map<number, CandidateReferenceSubmissionRow>();
  for (const referenceSubmission of candidateReferenceSubmissions) {
    if (!submissionsByReferenceId.has(referenceSubmission.reference_id)) {
      submissionsByReferenceId.set(referenceSubmission.reference_id, referenceSubmission);
    }
  }
  const references: CharacterReference[] = candidateReferences.length > 0
    ? candidateReferences.map(reference => ({
        id: reference.id,
        name: reference.referee_name,
        email: reference.referee_email,
        phone: reference.referee_phone ?? '',
        company: reference.referee_company ?? '',
        jobTitle: reference.referee_job_title ?? '',
        relationship: reference.relationship ?? '',
        bestTimeToCall: reference.best_time_to_call ?? '',
        requestSentAt: reference.request_sent_at,
        respondedAt: reference.responded_at,
        responsePayload: submissionsByReferenceId.get(reference.id)?.payload,
      }))
    : payloadReferences;
  const employmentSubmissionsByVerificationId = new Map<number, CandidateEmploymentVerificationSubmissionRow>();
  for (const employmentSubmission of candidateEmploymentVerificationSubmissions) {
    if (!employmentSubmissionsByVerificationId.has(employmentSubmission.verification_id)) {
      employmentSubmissionsByVerificationId.set(employmentSubmission.verification_id, employmentSubmission);
    }
  }
  const verifications: EmploymentVerification[] = candidateEmploymentVerifications.length > 0
    ? candidateEmploymentVerifications.map(verification => ({
        id: verification.id, company: verification.company, contactName: verification.hr_contact_name ?? '',
        email: verification.hr_email, phone: verification.hr_phone ?? '', bestTimeToCall: verification.best_time_to_call ?? '',
        requestSentAt: verification.request_sent_at, respondedAt: verification.responded_at,
        responsePayload: employmentSubmissionsByVerificationId.get(verification.id)?.payload,
      }))
    : payloadVerifications;
  const submitted = !!submission;
  const allThreeReferencesReady = candidateReferences.length === 3 && candidateReferences.every(reference =>
    !!reference.referee_name.trim() && !!reference.referee_email.trim(),
  );
  const unsentReferenceCount = candidateReferences.filter(reference => !reference.request_sent_at).length;
  const unsentEmploymentVerificationCount = candidateEmploymentVerifications.filter(verification => !verification.request_sent_at).length;

  return (
    <div className="space-y-6">
      <BackgroundCheckRequestState request={request} submission={submission} />

      <Section
        title={`Character references · ${references.length}`}
        icon={<Mail className="w-4 h-4" />}
        action={canSend && !submitted
          ? <SendPreEmploymentBgCheckButton candidateId={candidateId} />
          : canSend && allThreeReferencesReady && unsentReferenceCount > 0
            ? <SendCandidateReferenceEmailsButton candidateId={candidateId} remainingCount={unsentReferenceCount} />
            : undefined}
      >
        {references.length === 0
          ? <PreEmploymentEmptyRow text={submitted
            ? 'The submitted form did not include any character references.'
            : 'No references yet. Send the background-check email to request them from the candidate.'} />
          : <div className="space-y-3">{references.map((reference, index) => (
            <ReferenceSubmissionCard key={`${reference.email}-${index}`} reference={reference} index={index} />
          ))}</div>}
      </Section>

      <Section
        title={`Employment verifications · ${verifications.length}`}
        icon={<Building2 className="w-4 h-4" />}
        action={canSend && submitted && unsentEmploymentVerificationCount > 0
          ? <SendCandidateEmploymentVerificationEmailsButton candidateId={candidateId} remainingCount={unsentEmploymentVerificationCount} />
          : undefined}
      >
        {verifications.length === 0
          ? <PreEmploymentEmptyRow text={submitted
            ? 'The submitted form did not include any employment-verification contacts.'
            : 'No employment-verification contacts yet. They will appear after the candidate submits the form.'} />
          : <div className="space-y-3">{verifications.map((verification, index) => (
            <EmploymentVerificationCard key={`${verification.email}-${index}`} verification={verification} index={index} />
          ))}</div>}
      </Section>
    </div>
  );
}

function PreEmploymentCandidateInformationTab({ candidate }: { candidate: Candidate }) {
  const hasResumeInformation = Boolean(
    candidate.summary ||
    (candidate.skills?.length ?? 0) > 0 ||
    (candidate.experience?.length ?? 0) > 0 ||
    (candidate.education?.length ?? 0) > 0,
  );

  return (
    <Section title="Resume Information" icon={<FileText className="w-4 h-4" />}>
      {!hasResumeInformation ? (
        <PreEmploymentEmptyRow text="No resume information yet. Upload and parse a resume to show the candidate's summary, skills, experience, and education here." />
      ) : (
        <div className="space-y-5">
          {candidate.summary && <p className="whitespace-pre-wrap text-sm leading-relaxed text-(--rs-neutral-grey-700)">{candidate.summary}</p>}

          {(candidate.skills?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-(--rs-neutral-grey-700)">Skills</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {candidate.skills!.map((skill, index) => (
                  <span key={index} className="rounded-md bg-(--rs-primary-50) px-2.5 py-1 text-xs font-medium text-(--rs-primary-800)">{skill}</span>
                ))}
              </div>
            </div>
          )}

          {(candidate.experience?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-(--rs-neutral-grey-700)">Experience</p>
              <div className="mt-2 space-y-3">
                {candidate.experience!.map((experience, index) => (
                  <div key={index} className="rounded-lg border border-(--rs-neutral-grey-200) bg-white p-3">
                    <p className="text-sm font-semibold text-(--rs-neutral-grey-900)">
                      {experience.title || 'Role'} {experience.company && <span className="font-normal text-(--rs-neutral-grey-600)">@ {experience.company}</span>}
                    </p>
                    {formatDateRange(experience.start_date, experience.end_date) && <p className="mt-0.5 text-xs text-(--rs-neutral-grey-500)">{formatDateRange(experience.start_date, experience.end_date)}</p>}
                    {experience.description && <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-(--rs-neutral-grey-700)">{experience.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(candidate.education?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-(--rs-neutral-grey-700)">Education</p>
              <div className="mt-2 space-y-3">
                {candidate.education!.map((education, index) => (
                  <div key={index} className="rounded-lg border border-(--rs-neutral-grey-200) bg-white p-3">
                    <p className="text-sm font-semibold text-(--rs-neutral-grey-900)">{education.institution || 'Institution'}</p>
                    <p className="mt-0.5 text-xs text-(--rs-neutral-grey-600)">{[education.degree, education.field].filter(Boolean).join(' · ') || '—'}</p>
                    {education.graduation_year && <p className="mt-1 text-xs text-(--rs-neutral-grey-500)">Graduated {education.graduation_year}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

function BackgroundCheckRequestState({
  request, submission,
}: {
  request: PreEmploymentRequestRow | null;
  submission: PreEmploymentSubmissionRow | null;
}) {
  if (submission) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50/60 px-4 py-3 text-sm text-green-900">
        <p className="font-semibold">Background-check form submitted</p>
        <p className="mt-0.5 text-xs text-green-800">Received {formatDate(submission.submitted_at)}. The submitted contacts are shown below.</p>
      </div>
    );
  }
  if (request && !request.invalidated_at) {
    return (
      <div className="rounded-xl border border-(--rs-accent-200) bg-(--rs-accent-50)/60 px-4 py-3 text-sm text-(--rs-accent-900)">
        <p className="font-semibold">Awaiting candidate response</p>
        <p className="mt-0.5 text-xs text-(--rs-accent-800)">Email sent {formatDate(request.sent_at)}. The secure form link expires {formatDate(request.expires_at)}.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-dashed border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50)/40 px-4 py-3 text-sm text-(--rs-neutral-grey-700)">
      <p className="font-semibold">Not started</p>
      <p className="mt-0.5 text-xs text-(--rs-neutral-grey-500)">Send the background-check email to give the candidate a secure form link.</p>
    </div>
  );
}

function ReferenceSubmissionCard({ reference, index }: { reference: CharacterReference; index: number }) {
  const details = [reference.jobTitle, reference.company].filter(Boolean).join(' · ');
  const contact = [reference.email, reference.phone && formatPhoneNumber(reference.phone)].filter(Boolean).join(' · ');
  return (
    <div className="rounded-lg border border-(--rs-neutral-grey-200) bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-(--rs-neutral-grey-900)">Reference {index + 1}: {reference.name || 'Unnamed reference'}</p>
          {details && <p className="mt-0.5 text-xs text-(--rs-neutral-grey-600)">{details}</p>}
        </div>
        {reference.relationship && <span className="rounded-full bg-(--rs-primary-50) px-2 py-0.5 text-[10px] font-semibold text-(--rs-primary-700)">{reference.relationship}</span>}
      </div>
      {contact && <p className="mt-2 text-xs text-(--rs-neutral-grey-700)">{contact}</p>}
      {reference.bestTimeToCall && <p className="mt-1 text-[11px] text-(--rs-neutral-grey-500)">Best time to call: {reference.bestTimeToCall}</p>}
      {reference.requestSentAt && <p className="mt-1 text-[11px] font-medium text-green-700">Reference request sent {formatDate(reference.requestSentAt)}</p>}
      {reference.respondedAt && <p className="mt-1 text-[11px] font-medium text-green-700">Reference form submitted {formatDate(reference.respondedAt)}</p>}
      {reference.responsePayload != null && <ReferenceResponseModal refereeName={reference.name} payload={reference.responsePayload} />}
    </div>
  );
}

function EmploymentVerificationCard({ verification, index }: { verification: EmploymentVerification; index: number }) {
  const contact = [verification.email, verification.phone && formatPhoneNumber(verification.phone)].filter(Boolean).join(' · ');
  return (
    <div className="rounded-lg border border-(--rs-neutral-grey-200) bg-white p-3">
      <p className="text-sm font-semibold text-(--rs-neutral-grey-900)">Employer {index + 1}: {verification.company || 'Unnamed employer'}</p>
      {verification.contactName && <p className="mt-0.5 text-xs text-(--rs-neutral-grey-600)">HR contact: {verification.contactName}</p>}
      {contact && <p className="mt-2 text-xs text-(--rs-neutral-grey-700)">{contact}</p>}
      {verification.bestTimeToCall && <p className="mt-1 text-[11px] text-(--rs-neutral-grey-500)">Best time to call: {verification.bestTimeToCall}</p>}
      {verification.requestSentAt && <p className="mt-1 text-[11px] font-medium text-green-700">Employment-verification request sent {formatDate(verification.requestSentAt)}</p>}
      {verification.respondedAt && <p className="mt-1 text-[11px] font-medium text-green-700">Employment-verification form submitted {formatDate(verification.respondedAt)}</p>}
      {verification.responsePayload != null && <EmploymentVerificationResponseModal company={verification.company} payload={verification.responsePayload} />}
    </div>
  );
}

function PreEmploymentDocumentsTab({ candidateId, canUpload, documents }: { candidateId: number; canUpload: boolean; documents: CandidatePreEmploymentDocumentRow[] }) {
  const byKind = new Map(documents.map(document => [document.kind, document]));
  return (
    <Section
      title="Pre-Employment Documents"
      icon={<FileText className="w-4 h-4" />}
      action={documents.length === 4 && canUpload
        ? <SendCandidateDocumentPackageButton candidateId={candidateId} alreadySent={documents.every(document => !!document.sent_at)} />
        : undefined}
    >
      <p className="text-xs leading-relaxed text-(--rs-neutral-grey-600)">
        Upload approved PDFs here. Documents remain internal until a signing workflow is chosen.
      </p>
      <div className="mt-3 divide-y divide-(--rs-neutral-grey-200) rounded-lg border border-(--rs-neutral-grey-200) bg-white px-3">
        <PreEmploymentDocument
          name="Statement of Work"
          document={byKind.get('sow')}
          action={<div className="flex items-center gap-2">
            {canUpload && byKind.get('sow')?.sent_at && !byKind.get('sow')?.signed_at && <MarkCandidateSowSignedButton candidateId={candidateId} />}
            <PreEmploymentDocumentUpload candidateId={candidateId} kind="sow" canUpload={canUpload} />
          </div>}
        />
        <PreEmploymentDocument name="Job Description" document={byKind.get('job_description')} action={<PreEmploymentDocumentUpload candidateId={candidateId} kind="job_description" canUpload={canUpload} />} />
        <PreEmploymentDocument name="AI Policy" document={byKind.get('ai_policy')} action={<PreEmploymentDocumentUpload candidateId={candidateId} kind="ai_policy" canUpload={canUpload} />} />
        <PreEmploymentDocument name="NDA" document={byKind.get('nda')} action={<PreEmploymentDocumentUpload candidateId={candidateId} kind="nda" canUpload={canUpload} />} />
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
    { id: 'information',      label: 'Candidate Info',   icon: User2 },
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

function PreEmploymentDocument({ name, document, action }: { name: string; document?: CandidatePreEmploymentDocumentRow; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <div><span className="font-medium text-(--rs-neutral-grey-800)">{name}</span>{document && <a href={document.signed_url} target="_blank" rel="noreferrer" className="ml-2 text-[11px] font-semibold text-(--rs-primary-700) hover:underline">View uploaded document</a>}{document?.sent_at && <p className="mt-0.5 text-[10px] font-medium text-green-700">Sent {formatDate(document.sent_at)}</p>}{document?.signed_at && <p className="mt-0.5 text-[10px] font-medium text-green-700">Signed {formatDate(document.signed_at)}</p>}</div>
      {action ?? <PreEmploymentStatus />}
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
