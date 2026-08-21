import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ArrowLeft, Mail, Phone, Calendar, User2, History as HistoryIcon,
  FileText, ListChecks, StickyNote, Download, MailCheck, MailWarning,
  CheckCircle2, AlertCircle, Hash, Clock, Sparkles,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSession } from '@/lib/session';
import { hasToolAccess } from '@/lib/rbac';
import { getPhotoResolver } from '@/lib/orgchart';
import { refreshOnboarderSignedUrl } from '@/lib/storage';
import {
  OnboarderStatusSelect,
  OnboarderDelete,
  STATUS_LABEL,
} from '../onboarder-row';
import { UploadDocumentForm } from '../onboarder-forms';
import {
  SendWelcomeButton,
  ResendLastEmailButton,
  SendGmailNudgeButton,
  SendGroupChatButton,
  ChecklistToggle,
  NotesEditor,
} from '../onboarder-actions';
import type { OnboarderStatus } from '../constants';
import { formatPhoneNumber } from '@/lib/format';
import { listOnboardingLeadOptions, type OnboardingLeadOption } from '@/lib/onboarding-lead';
import { OnboardingLeadSelect } from '../onboarding-lead-select';
import { DirectSupervisorSelect } from '../direct-supervisor-select';

// ─── Types ──────────────────────────────────────────────────────────────────

type Onboarder = {
  id:                number;
  full_name:         string;
  personal_email:    string;
  romega_email:      string | null;
  phone:             string | null;
  onboarder_type:    string;
  role_title:        string | null;
  team:              string | null;
  direct_supervisor: string | null;
  direct_supervisor_id: number | null;
  chief_of_staff:    string | null;
  onboarding_lead:   string | null;
  onboarding_lead_id: number | null;
  onboarding_session_id: number | null;
  meeting_availability: 'pending' | 'yes' | 'no';
  hrbp:              string | null;
  status:            string;
  sow_sent_at:       string | null;
  sow_signed_at:     string | null;
  w8_uploaded_at:    string | null;
  start_date:        string | null;
  notes:             string | null;
  last_email_template: string | null;
  last_email_sent_at:  string | null;
  created_at:        string;
  created_by:        number | null;
  // Day-1 checklist (6 timestamps; nullable until done)
  teams_installed_at:     string | null;
  gmail_created_at:       string | null;
  signature_set_at:       string | null;
  wise_setup_at:          string | null;
  group_chats_joined_at:  string | null;
  orientation_done_at:    string | null;
};

type DocumentRow = {
  id:           number;
  kind:         string;
  label:        string | null;
  storage_path: string;
  mime_type:    string | null;
  size_bytes:   number | null;
  uploaded_at:  string;
};

type HistoryRow = {
  id:         number;
  user_name:  string | null;
  field:      string;
  new_value:  string | null;
  summary:    string;
  created_at: string;
};

type OnboardingSessionRow = {
  id: number;
  session_date: string;
  starts_at: string;
  status: 'scheduled' | 'finalized' | 'cancelled';
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const VALID_TABS = ['overview', 'documents', 'day-one', 'notes'] as const;
type Tab = typeof VALID_TABS[number];

const DOC_KIND_LABEL: Record<string, string> = {
  sow: 'SOW', w8: 'W-8', nda: 'NDA', contract: 'Contract',
  gov_id: 'Gov ID', nbi: 'NBI',
  reference_response: 'Reference response',
  employment_verification: 'Employment verification',
  other: 'Other',
};

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return iso; }
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

function formatBytes(n: number | null): string {
  if (!n || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default async function OnboarderDetailPage({
  params,
  searchParams,
}: {
  params:       Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getSession();
  if (!session || !hasToolAccess('onboarding', session.role, session.toolAccess)) {
    redirect('/dashboard');
  }

  const { id: idParam } = await params;
  const id = parseInt(idParam, 10);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const { tab: tabParam } = await searchParams;
  const tab: Tab = (VALID_TABS as readonly string[]).includes(tabParam ?? '')
    ? (tabParam as Tab)
    : 'overview';

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('onboarders')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error?.message?.toLowerCase().includes('does not exist')) {
    return <SetupRequired />;
  }
  if (!data) notFound();
  const o = data as Onboarder;
  const onboardingLeadOptions = await listOnboardingLeadOptions();

  // Onboarders are pre-employment, so most won't be on the org chart yet — this
  // resolves to a photo only once they've been added there; otherwise the
  // gradient initials below stand in.
  const photoUrl = (await getPhotoResolver())({ name: o.full_name, email: o.personal_email });

  // Children fetched in parallel
  const [docsRes, histRes, creatorRes, leadRes, supervisorRes, sessionRes] = await Promise.all([
    supabase.from('onboarder_documents')
      .select('id, kind, label, storage_path, mime_type, size_bytes, uploaded_at')
      .eq('onboarder_id', id)
      .order('uploaded_at', { ascending: false }),
    supabase.from('onboarder_history')
      .select('id, user_name, field, new_value, summary, created_at')
      .eq('onboarder_id', id)
      .order('created_at', { ascending: false })
      .limit(200),
    o.created_by
      ? supabase.from('users').select('name').eq('id', o.created_by).maybeSingle()
      : Promise.resolve({ data: null }),
    o.onboarding_lead_id
      ? supabase.from('users').select('name').eq('id', o.onboarding_lead_id).maybeSingle()
      : Promise.resolve({ data: null }),
    o.direct_supervisor_id
      ? supabase.from('users').select('name').eq('id', o.direct_supervisor_id).maybeSingle()
      : Promise.resolve({ data: null }),
    o.onboarding_session_id
      ? supabase.from('onboarding_sessions').select('id, session_date, starts_at, status').eq('id', o.onboarding_session_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const documents:     DocumentRow[]     = (docsRes.data as DocumentRow[] | null) ?? [];
  const history:       HistoryRow[]      = (histRes.data as HistoryRow[]      | null) ?? [];
  const createdByName  = (creatorRes?.data as { name?: string } | null)?.name ?? null;
  const onboardingLeadName = (leadRes?.data as { name?: string } | null)?.name ?? o.onboarding_lead;
  const directSupervisorName = (supervisorRes?.data as { name?: string } | null)?.name ?? o.direct_supervisor;
  const onboardingSession = (sessionRes?.data as OnboardingSessionRow | null) ?? null;

  // Sign every document URL once on the server
  const documentsSigned = await Promise.all(documents.map(async d => {
    let signed: string | null = null;
    try { signed = await refreshOnboarderSignedUrl(d.storage_path); } catch { signed = null; }
    return { ...d, signedUrl: signed };
  }));

  const lastFailedTemplate = (() => {
    const e = history.find(h => h.field === 'email_sent' || h.field === 'email_failed');
    return e && e.field === 'email_failed' ? (e.new_value ?? o.last_email_template ?? null) : null;
  })();

  return (
    <div className="space-y-6">
      <Link
        href="/onboarders"
        className="inline-flex items-center gap-1.5 text-sm text-(--rs-neutral-grey-500) hover:text-(--rs-primary-600) transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to onboarders
      </Link>

      {/* Hero */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-start gap-5">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt={o.full_name}
                className="h-16 w-16 shrink-0 rounded-2xl object-cover shadow-sm"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-(--rs-primary-500) to-(--rs-primary-700) text-white text-xl font-bold shadow-sm">
                {initials(o.full_name)}
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="inline-flex items-center gap-1 rounded-full bg-(--rs-neutral-grey-100) px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-(--rs-neutral-grey-700)">
                      {o.onboarder_type === 'intern' ? 'Intern' : 'Contractor'}
                    </span>
                    {o.role_title && (
                      <span className="text-[11px] text-(--rs-neutral-grey-500)">
                        {o.role_title}{o.team && ` · ${o.team}`}
                      </span>
                    )}
                  </div>
                  <h1 className="font-serif text-2xl font-bold text-(--rs-neutral-grey-900) leading-tight">
                    {o.full_name}
                  </h1>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <OnboarderStatusSelect id={o.id} status={o.status} />
                  <OnboarderDelete id={o.id} />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-(--rs-neutral-grey-700)">
                <ContactPill icon={<Mail className="w-3.5 h-3.5" />} text={o.personal_email} href={`mailto:${o.personal_email}`} />
                {o.romega_email && (
                  <ContactPill icon={<MailCheck className="w-3.5 h-3.5" />} text={o.romega_email} href={`mailto:${o.romega_email}`} />
                )}
                {o.phone && <ContactPill icon={<Phone className="w-3.5 h-3.5" />} text={formatPhoneNumber(o.phone)} href={`tel:${o.phone.replace(/\s+/g, '')}`} />}
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-(--rs-neutral-grey-500)">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" /> Added {formatDate(o.created_at)}
                </span>
                {createdByName && (
                  <span className="inline-flex items-center gap-1.5">
                    <User2 className="w-3 h-3" /> Added by <strong className="text-(--rs-neutral-grey-700)">{createdByName}</strong>
                  </span>
                )}
                {o.start_date && (
                  <span className="inline-flex items-center gap-1.5 text-(--rs-primary-700)">
                    <Clock className="w-3 h-3" /> Starts {formatDate(o.start_date)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <TabBar id={id} active={tab} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {tab === 'overview' && (
            <OverviewTab
              o={o}
              onLastFailedTemplate={lastFailedTemplate}
            />
          )}
          {tab === 'documents' && (
            <DocumentsTab onboarderId={id} documents={documentsSigned} />
          )}
          {tab === 'day-one' && <Day1Tab o={o} />}
          {tab === 'notes'    && <NotesTab o={o} />}
        </div>

        {/* Right rail */}
        <aside className="space-y-5">
          <QuickFacts
            o={o}
            onboardingLeadName={onboardingLeadName}
            directSupervisorName={directSupervisorName}
            onboardingLeadOptions={onboardingLeadOptions}
            onboardingSession={onboardingSession}
          />
          <ActionsRail o={o} lastFailedTemplate={lastFailedTemplate} />
          <HistoryRail history={history} />
        </aside>
      </div>
    </div>
  );
}

// ─── Tab bar ────────────────────────────────────────────────────────────────

function TabBar({ id, active }: { id: number; active: Tab }) {
  const tabs: { id: Tab; label: string; icon: typeof Mail; badge?: string }[] = [
    { id: 'overview',  label: 'Overview',         icon: User2 },
    { id: 'documents', label: 'Documents',        icon: FileText },
    { id: 'day-one',   label: 'Day-1 checklist',  icon: ListChecks },
    { id: 'notes',     label: 'Notes',            icon: StickyNote },
  ];
  return (
    <div className="overflow-x-auto">
      <div className="inline-flex gap-1 rounded-xl border border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50) p-1">
        {tabs.map(t => {
          const Icon = t.icon;
          const isActive = t.id === active;
          return (
            <Link
              key={t.id}
              href={t.id === 'overview' ? `/onboarders/${id}` : `/onboarders/${id}?tab=${t.id}`}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-white text-(--rs-primary-700) shadow-sm border border-(--rs-neutral-grey-200)'
                  : 'text-(--rs-neutral-grey-600) hover:text-(--rs-neutral-grey-900)'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
              {t.badge && (
                <span className="ml-1 rounded-full bg-(--rs-accent-100) px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-(--rs-accent-800)">
                  {t.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── Overview tab ───────────────────────────────────────────────────────────

function OverviewTab({ o, onLastFailedTemplate }: { o: Onboarder; onLastFailedTemplate: string | null }) {
  return (
    <Section title="Stage actions" icon={<Sparkles className="w-4 h-4" />}>
      <div className="space-y-5">
        {/* Current stage explainer */}
        <div className="rounded-lg border border-(--rs-primary-100) bg-(--rs-primary-50)/50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-(--rs-primary-700)">Current stage</p>
          <p className="mt-1 text-base font-semibold text-(--rs-neutral-grey-900)">
            {STATUS_LABEL[o.status as OnboarderStatus] ?? o.status}
          </p>
          <p className="mt-1 text-xs text-(--rs-neutral-grey-600) leading-relaxed">
            {stageExplainer(o.status)}
          </p>
        </div>

        {/* Welcome email */}
        <div className="rounded-lg border border-(--rs-neutral-grey-200) bg-white p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-(--rs-neutral-grey-500)">Welcome email (SOP §5)</p>
              <p className="mt-1 text-sm text-(--rs-neutral-grey-700)">
                Sends the {o.onboarder_type === 'intern' ? 'intern' : 'contractor'} variant with Teams + onboarding form{o.onboarder_type === 'contractor' && ' + W-8'} instructions.
              </p>
            </div>
            <SendWelcomeButton id={o.id} type={o.onboarder_type} />
          </div>
        </div>

        {/* Gmail + signature nudge (SOP §6) */}
        <div className="rounded-lg border border-(--rs-neutral-grey-200) bg-white p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-(--rs-neutral-grey-500)">Gmail + signature nudge (SOP §6)</p>
              <p className="mt-1 text-sm text-(--rs-neutral-grey-700)">
                Tells the new hire what format their Romega Gmail should follow{o.onboarder_type === 'intern' ? ' and links to the signature builder' : ''}.
              </p>
            </div>
            <SendGmailNudgeButton id={o.id} type={o.onboarder_type} />
          </div>
        </div>

        {/* Group-chat announcement (SOP §7) */}
        <div className="rounded-lg border border-(--rs-neutral-grey-200) bg-white p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-(--rs-neutral-grey-500)">Group-chat announcement (SOP §7)</p>
              <p className="mt-1 text-sm text-(--rs-neutral-grey-700)">
                Generates the team-wide welcome message for Teams. The Lead can paste it manually if needed.
              </p>
            </div>
            <SendGroupChatButton id={o.id} />
          </div>
        </div>

        {onLastFailedTemplate && (
          <div className="rounded-lg border border-red-100 bg-red-50/60 p-4">
            <div className="flex items-start gap-3">
              <MailWarning className="w-4 h-4 mt-0.5 text-red-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-red-900">Last email failed</p>
                <p className="mt-1 text-xs text-red-800 leading-relaxed">
                  Template <code className="rounded bg-white/60 px-1 py-0.5 text-[11px]">{onLastFailedTemplate}</code> did not reach n8n. The onboarder row is still correct; nothing else stopped working.
                </p>
                <div className="mt-2">
                  <ResendLastEmailButton id={o.id} template={onLastFailedTemplate} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

function stageExplainer(status: string): string {
  switch (status) {
    case 'pre_onboarding':   return 'Send the welcome email. New hire installs Teams, creates Romega Gmail, configures signature, submits the onboarding form + W-8 if contractor.';
    case 'day_one':          return 'Account provisioning, team intros, calendar handoff. Orientation call with the Onboarding Lead.';
    case 'thirty_day':       return 'First review with the lead — fit, blockers, training gaps. (30-day workflow ships post-MVP.)';
    case 'ninety_day':       return 'End of probation — pass/fail decision documented. (90-day workflow ships post-MVP.)';
    case 'regularized':      return 'Full-time hire; onboarding flow complete.';
    case 'failed_probation': return 'Did not pass the 90-day review.';
    case 'withdrew':         return 'Resigned during onboarding.';
    default:                 return '';
  }
}

function DocumentsTab({
  onboarderId, documents,
}: {
  onboarderId: number;
  documents:   (DocumentRow & { signedUrl: string | null })[];
}) {
  return (
    <Section
      title={`Documents · ${documents.length}`}
      icon={<FileText className="w-4 h-4" />}
      action={<UploadDocumentForm onboarderId={onboarderId} />}
    >
      {documents.length === 0
        ? <EmptyRow text="No documents uploaded yet. Add SOW, W-8, gov IDs, NBI clearance, or reference response PDFs." />
        : (
          <ul className="space-y-2">
            {documents.map(d => (
              <li key={d.id} className="flex items-start justify-between gap-3 rounded-lg border border-(--rs-neutral-grey-100) bg-(--rs-neutral-grey-50)/40 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="rounded-md bg-(--rs-primary-50) px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-(--rs-primary-800)">
                      {DOC_KIND_LABEL[d.kind] ?? d.kind}
                    </span>
                    {d.label && <span className="text-sm font-semibold text-(--rs-neutral-grey-900) truncate">{d.label}</span>}
                  </div>
                  <p className="mt-0.5 text-[11px] text-(--rs-neutral-grey-500) flex items-center gap-2 flex-wrap">
                    <span>{formatDate(d.uploaded_at)}</span>
                    <span className="text-(--rs-neutral-grey-300)">·</span>
                    <span>{formatBytes(d.size_bytes)}</span>
                    {d.mime_type && <>
                      <span className="text-(--rs-neutral-grey-300)">·</span>
                      <span className="font-mono text-[10px]">{d.mime_type}</span>
                    </>}
                  </p>
                </div>
                {d.signedUrl ? (
                  <a
                    href={d.signedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-(--rs-neutral-grey-200) bg-white px-3 py-1.5 text-xs font-semibold text-(--rs-neutral-grey-800) hover:bg-(--rs-neutral-grey-50) transition-colors shrink-0 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </a>
                ) : (
                  <span className="text-[11px] text-red-600">link error</span>
                )}
              </li>
            ))}
          </ul>
        )}
    </Section>
  );
}

// ─── Day-1 checklist tab ────────────────────────────────────────────────────

const DAY1_ITEMS: { key: keyof Onboarder; label: string; hint: string }[] = [
  { key: 'teams_installed_at',    label: 'Teams installed',       hint: 'Microsoft Teams app on desktop or mobile' },
  { key: 'gmail_created_at',      label: 'Romega Gmail created',  hint: 'firstName@romega-solutions.com (contractor) or jsmith.romegasolutions@gmail.com (intern)' },
  { key: 'signature_set_at',      label: 'Email signature set',   hint: 'Generated at romega-email-signature.vercel.app' },
  { key: 'wise_setup_at',         label: 'Wise account set up',   hint: 'Banking details captured + verified' },
  { key: 'group_chats_joined_at', label: 'Group chats joined',    hint: 'Team + company-wide Teams chats' },
  { key: 'orientation_done_at',   label: 'Orientation done',      hint: 'Welcome call + tooling tour complete' },
];

function Day1Tab({ o }: { o: Onboarder }) {
  const done = DAY1_ITEMS.filter(i => o[i.key]).length;
  const pct  = Math.round((done / DAY1_ITEMS.length) * 100);
  return (
    <Section title={`Day-1 checklist · ${done}/${DAY1_ITEMS.length}`} icon={<ListChecks className="w-4 h-4" />}>
      <div className="space-y-4">
        <div className="rounded-lg border border-(--rs-primary-100) bg-(--rs-primary-50)/40 p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-semibold text-(--rs-primary-800)">{pct}% complete</p>
            {o.status === 'day_one' && done === DAY1_ITEMS.length && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-800">
                <CheckCircle2 className="w-3 h-3" /> Will auto-advance to 30-day
              </span>
            )}
          </div>
          <div className="h-1.5 rounded-full bg-(--rs-primary-100) overflow-hidden">
            <div className="h-full bg-(--rs-primary-600) transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-[11px] text-(--rs-neutral-grey-600) leading-relaxed">
            Toggle each item as you complete it. When all 7 are checked AND the onboarder is in <code className="rounded bg-white/60 px-1 text-[10px]">day_one</code>, the status auto-advances to <code className="rounded bg-white/60 px-1 text-[10px]">thirty_day</code>.
          </p>
        </div>

        <div className="space-y-2">
          {DAY1_ITEMS.map(item => (
            <div key={String(item.key)}>
              <ChecklistToggle
                id={o.id}
                fieldKey={String(item.key)}
                label={item.label}
                value={o[item.key] as string | null}
              />
              <p className="mt-0.5 ml-8 text-[11px] text-(--rs-neutral-grey-500)">{item.hint}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ─── Notes tab ──────────────────────────────────────────────────────────────

function NotesTab({ o }: { o: Onboarder }) {
  return (
    <Section title="Notes" icon={<StickyNote className="w-4 h-4" />}>
      <NotesEditor id={o.id} initial={o.notes} />
    </Section>
  );
}

// ─── Right rail ─────────────────────────────────────────────────────────────

function QuickFacts({
  o,
  onboardingLeadName,
  directSupervisorName,
  onboardingLeadOptions,
  onboardingSession,
}: {
  o: Onboarder;
  onboardingLeadName: string | null;
  directSupervisorName: string | null;
  onboardingLeadOptions: OnboardingLeadOption[];
  onboardingSession: OnboardingSessionRow | null;
}) {
  return (
    <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-4 space-y-2.5">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-(--rs-neutral-grey-500)">Quick facts</h3>
      <KvRow label="ID" value={
        <span className="inline-flex items-center gap-1 font-mono text-[11px] tracking-tight text-(--rs-primary-700)">
          <Hash className="w-3 h-3" /> ONB-{String(o.id).padStart(4, '0')}
        </span>
      } />
      <KvRow label="Type"       value={o.onboarder_type === 'intern' ? 'Intern' : 'Contractor'} />
      <KvRow label="Role"       value={o.role_title ?? <Dim />} />
      <KvRow label="Team"       value={o.team ?? <Dim />} />
      <KvRow label="Supervisor" value={
        <DirectSupervisorSelect
          onboarderId={o.id}
          currentSupervisorId={o.direct_supervisor_id}
          currentSupervisorName={directSupervisorName}
          options={onboardingLeadOptions}
        />
      } />
      <KvRow label="Onboarding Lead" value={
        <OnboardingLeadSelect
          onboarderId={o.id}
          currentLeadId={o.onboarding_lead_id}
          currentLeadName={onboardingLeadName}
          options={onboardingLeadOptions}
        />
      } />
      <KvRow label="HRBP"       value={o.hrbp ?? <Dim />} />
      <KvRow label="Start date" value={o.start_date ? formatDate(o.start_date) : <Dim />} />
      <KvRow label="W-8"        value={o.w8_uploaded_at ? formatDate(o.w8_uploaded_at) : <Dim />} />
      <KvRow label="Friday cohort" value={
        onboardingSession
          ? <span className="text-right"><span>{formatDate(onboardingSession.session_date)}</span><span className="block text-[10px] text-(--rs-neutral-grey-500)">6:00 PM PHT · {o.meeting_availability}</span></span>
          : <Dim text="not assigned" />
      } />
      <KvRow label="Last email" value={
        o.last_email_template
          ? <span className="inline-flex items-center gap-1 text-(--rs-neutral-grey-800)">
              <MailCheck className="w-3 h-3 text-(--rs-primary-600)" />
              <span className="font-mono text-[10px]">{o.last_email_template}</span>
              <span className="text-(--rs-neutral-grey-400)">·</span>
              <span className="text-(--rs-neutral-grey-500)">{formatDate(o.last_email_sent_at) ?? ''}</span>
            </span>
          : <Dim text="none" />
      } />
    </div>
  );
}

function ActionsRail({ o, lastFailedTemplate }: { o: Onboarder; lastFailedTemplate: string | null }) {
  if (!lastFailedTemplate) return null;
  // Other actions live on the Overview tab body. The rail only surfaces
  // "errors that need attention" so it stays calm.
  return (
    <div className="rounded-xl border border-red-100 bg-red-50/50 p-4 space-y-2.5">
      <div className="flex items-center gap-2">
        <MailWarning className="w-3.5 h-3.5 text-red-600" />
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-red-700">Needs attention</h3>
      </div>
      <p className="text-xs text-red-800 leading-snug">
        Last attempted email <strong>{lastFailedTemplate}</strong> did not reach n8n.
      </p>
      <ResendLastEmailButton id={o.id} template={lastFailedTemplate} />
    </div>
  );
}

function HistoryRail({ history }: { history: HistoryRow[] }) {
  return (
    <div className="rounded-xl border border-(--rs-neutral-grey-200) bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <HistoryIcon className="w-3.5 h-3.5 text-(--rs-primary-600)" />
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-(--rs-neutral-grey-500)">History</h3>
      </div>
      {history.length === 0
        ? <p className="text-xs text-(--rs-neutral-grey-500)">No changes recorded yet.</p>
        : (
          <ol className="space-y-2 max-h-[32rem] overflow-y-auto pr-1">
            {history.map(h => (
              <li key={h.id} className="text-xs leading-snug">
                <span className="text-(--rs-neutral-grey-500)">{formatHistoryTime(h.created_at)}</span>
                <span className="text-(--rs-neutral-grey-400)"> — </span>
                <span className="font-semibold text-(--rs-neutral-grey-800)">{abbreviateName(h.user_name)}</span>
                <span className="text-(--rs-neutral-grey-400)">: </span>
                <span className={h.field === 'email_failed' ? 'text-red-700' : 'text-(--rs-neutral-grey-700)'}>
                  {h.summary}
                </span>
              </li>
            ))}
          </ol>
        )}
    </div>
  );
}

// ─── Small bits ─────────────────────────────────────────────────────────────

function Section({
  title, icon, action, children,
}: {
  title:    string;
  icon?:    React.ReactNode;
  action?:  React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="font-serif text-base font-bold text-(--rs-neutral-grey-900) flex items-center gap-2">
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

function Dim({ text = '—' }: { text?: string }) {
  return <span className="text-(--rs-neutral-grey-400)">{text}</span>;
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-(--rs-neutral-grey-200) bg-(--rs-neutral-grey-50)/40 px-4 py-6 text-center text-xs text-(--rs-neutral-grey-500)">
      {text}
    </div>
  );
}

function SetupRequired() {
  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 text-(--rs-accent-700)" />
          <div>
            <h2 className="font-serif text-lg font-bold text-(--rs-neutral-grey-900)">Setup required</h2>
            <p className="mt-1 text-sm text-(--rs-neutral-grey-600)">
              The <code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-xs">onboarders</code> table hasn&apos;t been created yet. Run{' '}
              <code className="rounded bg-(--rs-neutral-grey-100) px-1.5 py-0.5 text-xs">docs/migrations/add-onboarders-tables.sql</code> in the Supabase SQL Editor.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

